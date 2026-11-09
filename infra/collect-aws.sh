#!/usr/bin/env bash
# Guarda el inventario real de la cuenta (instancias, subredes, grupos de seguridad, NAT)
# como evidencia para el dashboard. La IP de administracion se enmascara.
#
# Uso: infra/collect-aws.sh   (despues: infra/deploy.sh evidence)
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

OUT_DIR="$GEN_DIR/evidence"
TMP="$GEN_DIR/aws-raw"
mkdir -p "$OUT_DIR" "$TMP"
VPC="$(vpc_id)"

aw ec2 describe-instances --filters "Name=tag:Project,Values=$PROJECT" \
  "Name=instance-state-name,Values=pending,running,stopping,stopped" --output json > "$TMP/instances.json"
aw ec2 describe-volumes --filters "Name=tag:Project,Values=$PROJECT" --output json > "$TMP/volumes.json"
aw ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC" --output json > "$TMP/subnets.json"
aw ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC" --output json > "$TMP/routes.json"
aw ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC" --output json > "$TMP/sgs.json"
aw ec2 describe-nat-gateways --filter "Name=vpc-id,Values=$VPC" --output json > "$TMP/nat.json"
aw ec2 describe-vpcs --vpc-ids "$VPC" --output json > "$TMP/vpc.json"

RAW="$(cygpath -w "$TMP")" OUT="$(cygpath -w "$OUT_DIR/aws.json")" REGION="$REGION" python - <<'PY'
import json, os
from datetime import datetime, timezone

raw = os.environ["RAW"]
load = lambda name: json.load(open(os.path.join(raw, name), encoding="utf-8"))
tag = lambda obj: next((t["Value"] for t in obj.get("Tags", []) if t["Key"] == "Name"), obj.get("GroupName", ""))

instances = [i for r in load("instances.json")["Reservations"] for i in r["Instances"]]
volumes = {v["VolumeId"]: v for v in load("volumes.json")["Volumes"]}
sgs = load("sgs.json")["SecurityGroups"]
sg_names = {g["GroupId"]: g["GroupName"] for g in sgs}
routes = load("routes.json")["RouteTables"]

def default_route(subnet_id):
    for table in routes:
        if any(a.get("SubnetId") == subnet_id for a in table.get("Associations", [])):
            for route in table["Routes"]:
                if route.get("DestinationCidrBlock") == "0.0.0.0/0":
                    return route.get("GatewayId") or route.get("NatGatewayId") or "?"
            return "sin ruta a internet"
    return "tabla principal"

def peer(perm_item, kind):
    if kind == "ip":
        cidr = perm_item["CidrIp"]
        # La IP de administracion no se publica en el dashboard.
        return "IP-admin/32" if cidr.endswith("/32") else cidr
    return f'sg:{sg_names.get(perm_item["GroupId"], perm_item["GroupId"])}'

def rules(group):
    out = []
    for direction, perms in (("entrada", group["IpPermissions"]), ("salida", group["IpPermissionsEgress"])):
        for p in perms:
            proto = "todo" if p["IpProtocol"] == "-1" else p["IpProtocol"]
            ports = "todos" if "FromPort" not in p else (str(p["FromPort"]) if p["FromPort"] == p["ToPort"] else f'{p["FromPort"]}-{p["ToPort"]}')
            for item in p.get("IpRanges", []):
                out.append({"direction": direction, "protocol": proto, "ports": ports, "peer": peer(item, "ip"), "description": item.get("Description", "")})
            for item in p.get("UserIdGroupPairs", []):
                out.append({"direction": direction, "protocol": proto, "ports": ports, "peer": peer(item, "sg"), "description": item.get("Description", "")})
    return out

vpc = load("vpc.json")["Vpcs"][0]
inventory = {
    "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "account_region": os.environ["REGION"],
    "vpc": {"id": vpc["VpcId"], "cidr": vpc["CidrBlock"]},
    "subnets": sorted(
        [{"name": tag(s), "id": s["SubnetId"], "cidr": s["CidrBlock"], "public": default_route(s["SubnetId"]).startswith("igw-"),
          "route": default_route(s["SubnetId"])} for s in load("subnets.json")["Subnets"]],
        key=lambda s: s["cidr"]),
    "instances": sorted([{
        "name": tag(i), "id": i["InstanceId"], "type": i["InstanceType"],
        "vcpu": i["CpuOptions"]["CoreCount"] * i["CpuOptions"]["ThreadsPerCore"],
        "state": i["State"]["Name"], "private_ip": i.get("PrivateIpAddress"), "public_ip": i.get("PublicIpAddress"),
        "subnet": i.get("SubnetId"), "imdsv2": i["MetadataOptions"]["HttpTokens"] == "required",
        "ebs": [{"size": volumes[m["Ebs"]["VolumeId"]]["Size"], "type": volumes[m["Ebs"]["VolumeId"]]["VolumeType"],
                 "encrypted": volumes[m["Ebs"]["VolumeId"]]["Encrypted"]} for m in i["BlockDeviceMappings"] if m["Ebs"]["VolumeId"] in volumes],
        "groups": [g["GroupName"] for g in i["SecurityGroups"]],
        "launch_time": i["LaunchTime"],
    } for i in instances], key=lambda i: i["private_ip"] or ""),
    "security_groups": sorted([{"name": g["GroupName"], "id": g["GroupId"], "description": g["Description"], "rules": rules(g)} for g in sgs],
                              key=lambda g: g["name"]),
    "nat_gateways": [{"id": n["NatGatewayId"], "state": n["State"]} for n in load("nat.json")["NatGateways"] if n["State"] != "deleted"],
    "internet_gateway": None,
}
with open(os.environ["OUT"], "w", encoding="utf-8", newline="\n") as handle:
    json.dump(inventory, handle, ensure_ascii=False, indent=1)
print(f'{len(inventory["instances"])} instancias, {len(inventory["security_groups"])} grupos, {len(inventory["subnets"])} subredes')
PY
rm -rf "$TMP"
log "Inventario guardado en infra/generated/evidence/aws.json"

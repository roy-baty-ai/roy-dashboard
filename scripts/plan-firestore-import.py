#!/usr/bin/env python3
"""Local dry run only: validates an approved snapshot; never contacts Firebase."""
import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--expected-sha256',required=True);a=p.parse_args()
repo=Path(__file__).resolve().parent.parent
if a.input.resolve().is_relative_to(repo) or a.output.resolve().is_relative_to(repo):p.error('Private input/output must stay outside the public repository')
data=json.loads(a.input.read_bytes());digest=hashlib.sha256(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
if digest!=a.expected_sha256:p.error('Canonical source digest mismatch')
if data.get('schema_version')!=1 or not isinstance(data.get('cases'),list) or len(data['cases'])>50:p.error('Unsupported snapshot')
ids=[c.get('id') for c in data['cases']]
if any(not isinstance(i,str) or not i for i in ids) or len(set(ids))!=len(ids):p.error('Missing or duplicate case IDs; resolve mapping first')
# IDs remain source IDs; never generate random IDs or duplicate append-only records.
plan={'operation':'CREATE_ONLY_AFTER_SEPARATE_APPROVAL','target':'privatePipeline/current','revision':1,'sourceHash':digest,'caseCount':len(ids),'requires':['confirmed project and database','approved administrator UID','deployed tested rules','control/source mode=migration','transaction must assert destination does not exist','private verification before canonical cutover'],'publicUpload':False}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(plan,indent=2)+'\n');a.output.chmod(0o600)
print('Dry-run plan created; no network or database writes.')

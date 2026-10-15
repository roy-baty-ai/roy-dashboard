// Proposal runtime: called only after separately approved WIF/IAM provisioning.
// GoogleAuth is injected so tests never request or persist credentials.
export const SIGNER='roy-results-signer@roy-dashboard-20261008.iam.gserviceaccount.com';
export const WRITER_UID='roy-results-writer-v1';
export async function mintWriterToken(client,{now=Math.floor(Date.now()/1000)}={}){
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const content=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:SIGNER,sub:SIGNER,aud:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',iat:now,exp:now+3600,uid:WRITER_UID,claims:{roy_writer:true,writer_scope:'results-v1'}});
 const result=await client.request({url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SIGNER}:signBlob`,method:'POST',data:{payload:Buffer.from(content).toString('base64')}});
 if(typeof result.data?.signedBlob!=='string'||!result.data.signedBlob)throw Error('Token signing unconfirmed');
 return content+'.'+Buffer.from(result.data.signedBlob,'base64').toString('base64url');
}
export function assertApprovedJob(env){
 if(env.GITHUB_REPOSITORY_ID!=='1400072927'||env.GITHUB_REPOSITORY_OWNER_ID!=='336551905'||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_WORKFLOW_REF!=='roy-baty-ai/roy-lab/.github/workflows/roy-results-sync.yml@refs/heads/main'||!['push','schedule','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME))throw Error('Unapproved execution context');
}

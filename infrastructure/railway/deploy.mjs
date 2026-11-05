import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function deploy(env = process.env, fetcher = fetch, sleep = delay) {
  const kind = env.DEPLOY_COMPONENT;
  const image = env.DEPLOY_IMAGE;
  if (!['web', 'backend'].includes(kind) || !/^ghcr\.io\/[a-z0-9_./-]+@sha256:[a-f0-9]{64}$/.test(image ?? '')) {
    throw new Error('Select web or backend and supply an immutable GHCR image digest.');
  }
  for (const key of ['RAILWAY_API_TOKEN', 'RAILWAY_ENVIRONMENT_ID']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  if (env.GITHUB_REPOSITORY && !image.startsWith(`ghcr.io/${env.GITHUB_REPOSITORY.toLowerCase()}-${kind === 'web' ? 'web' : 'api'}@`)) {
    throw new Error('Image must belong to the selected component in this repository.');
  }
  const roles = kind === 'web' ? ['web'] : ['api', 'worker', 'scheduler'];
  for (const role of roles) {
    if (!env[`RAILWAY_${role.toUpperCase()}_SERVICE_ID`]) throw new Error(`Missing service ID for ${role}`);
  }
  async function graphql(query, variables) {
    const response = await fetcher('https://backboard.railway.com/graphql/v2', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RAILWAY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Railway HTTP ${response.status}`);
    const body = await response.json();
    if (body.errors?.length) throw new Error('Railway rejected the operation; inspect service settings and API permissions.');
    return body.data;
  }
  // API goes first: its single pre-deploy migration must succeed before workers change.
  for (const role of roles) {
    const variables = { serviceId: env[`RAILWAY_${role.toUpperCase()}_SERVICE_ID`], environmentId: env.RAILWAY_ENVIRONMENT_ID };
    const config = JSON.parse(await readFile(new URL(`${role}.json`, import.meta.url), 'utf8'));
    await graphql('mutation($serviceId:String!,$environmentId:String!,$input:ServiceInstanceUpdateInput!){serviceInstanceUpdate(serviceId:$serviceId,environmentId:$environmentId,input:$input)}',
      { ...variables, input: { ...config, source: { image } } });
    const deployed = await graphql('mutation($serviceId:String!,$environmentId:String!){serviceInstanceDeployV2(serviceId:$serviceId,environmentId:$environmentId)}', variables);
    const id = deployed.serviceInstanceDeployV2;
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      const data = await graphql('query($id:String!){deployment(id:$id){status}}', { id });
      const status = data.deployment.status;
      if (status === 'SUCCESS') { ready = true; break; }
      if (['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'].includes(status)) throw new Error(`${role} deployment ${status}; release stopped.`);
      await sleep(10000);
    }
    if (!ready) throw new Error(`${role} deployment timed out; inspect Railway before retrying.`);
    console.log(`${role}: deployed ${image}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await deploy();

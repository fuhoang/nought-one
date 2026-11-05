import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploy } from '../railway/deploy.mjs';

const digest = 'a'.repeat(64);
function environment(component = 'backend') {
  return {
    DEPLOY_COMPONENT: component, DEPLOY_IMAGE: `ghcr.io/example/nought-${component === 'web' ? 'web' : 'api'}@sha256:${digest}`,
    GITHUB_REPOSITORY: 'example/nought', RAILWAY_API_TOKEN: 'test-only-token', RAILWAY_ENVIRONMENT_ID: 'staging',
    RAILWAY_API_SERVICE_ID: 'api', RAILWAY_WORKER_SERVICE_ID: 'worker',
    RAILWAY_SCHEDULER_SERVICE_ID: 'scheduler', RAILWAY_WEB_SERVICE_ID: 'web',
  };
}
function railway(calls, failed = false) {
  return async (url, options) => {
    assert.equal(url, 'https://backboard.railway.com/graphql/v2');
    const body = JSON.parse(options.body);
    calls.push(body);
    let data;
    if (body.query.startsWith('mutation') && body.query.includes('serviceInstanceUpdate(')) {
      data = { serviceInstanceUpdate: true };
    } else if (body.query.includes('serviceInstanceDeployV2(')) {
      data = { serviceInstanceDeployV2: body.variables.serviceId };
    } else {
      data = { deployment: { status: failed ? 'FAILED' : 'SUCCESS' } };
    }
    return { ok: true, json: async () => ({ data }) };
  };
}
test('backend deploys one digest to API, then worker and scheduler after API readiness', async () => {
  const calls = [];
  await deploy(environment(), railway(calls));
  const updates = calls.filter(c => c.variables.input);
  assert.deepEqual(updates.map(c => c.variables.serviceId), ['api', 'worker', 'scheduler']);
  assert.ok(updates.every(c => c.variables.input.source.image === environment().DEPLOY_IMAGE));
  assert.deepEqual(updates.map(c => c.variables.input.preDeployCommand?.length ?? 0), [1, 0, 0]);
  assert.equal(calls[2].variables.id, 'api');
  assert.equal(calls[3].variables.serviceId, 'worker');
});
test('a failed API release stops before changing worker or scheduler', async () => {
  const calls = [];
  await assert.rejects(deploy(environment(), railway(calls, true)), /api deployment FAILED/);
  assert.equal(calls.filter(c => c.variables.input).length, 1);
});
test('web deploy is independent from the backend', async () => {
  const calls = [];
  await deploy(environment('web'), railway(calls));
  assert.equal(calls.length, 3);
  assert.equal(calls[0].variables.serviceId, 'web');
  assert.equal(calls[0].variables.input.healthcheckPath, '/health');
});
test('mutable tags and images from other components are rejected before network calls', async () => {
  const fetcher = async () => { throw new Error('Network must not be called'); };
  await assert.rejects(deploy({ ...environment(), DEPLOY_IMAGE: 'ghcr.io/example/nought-api:latest' }, fetcher), /immutable/);
  await assert.rejects(deploy({ ...environment(), DEPLOY_IMAGE: environment('web').DEPLOY_IMAGE }, fetcher), /selected component/);
});

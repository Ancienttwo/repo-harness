import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// argv: <PATH pi package root> <review agent directory> <provider/model>.
// pi's own resolver selects the model, as `pi --model <provider/model>` does.
// The credential store is empty and catalog refresh is off, so this child
// reads no credential and makes no network call.
const [root, agentDirectory, reference] = process.argv.slice(2) as [string, string, string];
const { ModelRuntime, resolveCliModel } = await import(pathToFileURL(join(root, 'dist/index.js')).href);
const refused = async () => { throw new Error('review_pi_resolver_credential_write'); };
const models = join(agentDirectory, 'models.json');
const modelRuntime = await ModelRuntime.create({
  credentials: { read: async () => undefined, list: async () => [], modify: refused, delete: refused },
  modelsPath: existsSync(models) ? models : null,
  modelsStore: { read: async () => undefined, write: refused, delete: refused },
  allowModelNetwork: false, refreshOnCreate: false,
});
const result = resolveCliModel({ cliModel: reference, modelRuntime });
process.stdout.write(`${JSON.stringify(result.model ? { provider: result.model.provider, model: result.model.id } : { error: result.error ?? 'unresolved' })}\n`);

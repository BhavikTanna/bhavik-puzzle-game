#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { App } from 'aws-cdk-lib'
import { BrickwordsStack } from '../lib/brickwords-stack'

const here = dirname(fileURLToPath(import.meta.url))
const siteDist = resolve(here, '../../dist')

/**
 * The distribution serving bhaviktanna.dev, which owns the apex domain and adds
 * the /brickwords behaviours (see the cv repo's infra/lib/infra-stack.ts).
 *
 * This is the DEFAULT, not an opt-in flag, and deliberately so. When it was
 * opt-in, a plain `yarn deploy` built a second distribution and wrote a bucket
 * policy naming only that one — which locked out the CV distribution. S3 then
 * answered it with 403, and the CV's distribution-wide error response turned
 * that into a 200 serving the CV. The site looked deployed and the URL looked
 * broken, with nothing in between to say why. Opt out with `-c standalone=true`.
 */
const SERVING_DISTRIBUTION_ID = 'E3H1QIBL15I14G'

const app = new App()

/** Read a value from `-c key=value`, falling back to an env var. */
const context = (key: string, envVar: string): string | undefined => {
  const value = app.node.tryGetContext(key) ?? process.env[envVar]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

// The site is bundled into the stack, so it must be built before synthesis.
// Failing here with a clear message beats a confusing CDK asset error.
if (!existsSync(siteDist)) {
  throw new Error(`No build found at ${siteDist}. Run "yarn build" in the project root first.`)
}

const domainNames = context('domainNames', 'DOMAIN_NAMES')
  ?.split(',')
  .map((name) => name.trim())
  .filter(Boolean)

new BrickwordsStack(app, context('stackName', 'STACK_NAME') ?? 'Brickwords', {
  siteDist,
  basePath: context('basePath', 'BASE_PATH_SEGMENT') ?? 'brickwords',
  bucketName: context('bucketName', 'SITE_BUCKET_NAME') ?? 'bhaviktanna-brickwords-site',
  servingDistributionId:
    app.node.tryGetContext('standalone') === 'true'
      ? undefined
      : (context('servingDistributionId', 'SERVING_DISTRIBUTION_ID') ??
        SERVING_DISTRIBUTION_ID),
  domainNames,
  certificateArn: context('certificateArn', 'CERTIFICATE_ARN'),
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'Brickwords puzzle game: S3 + CloudFront static hosting',
})

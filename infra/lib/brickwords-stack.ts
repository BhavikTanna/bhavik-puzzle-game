import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_iam as iam,
  aws_s3 as s3,
  aws_s3_deployment as s3deploy,
  type StackProps,
} from 'aws-cdk-lib'
import type { Construct } from 'constructs'

export interface BrickwordsStackProps extends StackProps {
  /** Directory holding the built site (Vite's `dist`). */
  siteDist: string
  /**
   * Path the game is served under, without slashes — 'brickwords' puts it at
   * https://bhaviktanna.dev/brickwords/. Doubles as the S3 key prefix, so
   * CloudFront can forward the request URI to the origin unchanged. Must match
   * Vite's `base`. Empty string serves at the root.
   */
  basePath?: string
  /**
   * Fixed bucket name. Needed because the CV stack, in a separate repo, imports
   * this bucket by name to add it as a CloudFront origin — the two stacks are
   * deployed independently, so they agree on a literal rather than a reference.
   */
  bucketName?: string
  /**
   * Serve through a CloudFront distribution this stack does not own — the one
   * already on bhaviktanna.dev. When set, no distribution is created here:
   * the bucket is granted to that distribution instead, and deploys invalidate
   * it. Add the matching origin and cache behaviours on that side; see README.
   */
  servingDistributionId?: string
  /** Custom domains for the distribution. Requires `certificateArn`. */
  domainNames?: string[]
  /** ACM certificate ARN. CloudFront only reads certificates from us-east-1. */
  certificateArn?: string
  /** `owner/repo` allowed to deploy through GitHub OIDC. */
  githubRepo?: string
  /**
   * Create the account's GitHub OIDC provider. An account can hold exactly
   * one, so leave this false if something else already created it.
   */
  createOidcProvider?: boolean
}

/**
 * Static hosting for Brickwords: a private bucket served by CloudFront through
 * Origin Access Control, with the built site deployed as part of the stack.
 */
export class BrickwordsStack extends Stack {
  constructor(scope: Construct, id: string, props: BrickwordsStackProps) {
    super(scope, id, props)

    const basePath = (props.basePath ?? 'brickwords').replace(/^\/+|\/+$/g, '')

    if (props.domainNames?.length && !props.certificateArn) {
      throw new Error('domainNames requires certificateArn (an ACM cert in us-east-1)')
    }
    if (props.servingDistributionId && props.domainNames?.length) {
      throw new Error(
        'domainNames configures this stack\'s own distribution, but servingDistributionId ' +
          'means another distribution serves the site. Set the domain on that one instead.',
      )
    }

    // Never public: CloudFront is the only reader.
    const bucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: props.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      // Retain so tearing down the stack cannot quietly delete the content.
      removalPolicy: RemovalPolicy.RETAIN,
    })

    /*
      Two ways to serve this bucket:

      1. Through the distribution already on bhaviktanna.dev, which owns the
         apex domain and its catch-all. Nothing is created here beyond a bucket
         policy naming that distribution — the origin and cache behaviours are
         added on that side, because a distribution can only be configured by
         whoever owns it.
      2. Standalone, with its own distribution. Used when this stack is
         deployed on its own.
    */
    const serving = props.servingDistributionId
    const distribution = serving
      ? undefined
      : new cloudfront.Distribution(this, 'Distribution', {
          comment: 'Brickwords static site',
          defaultRootObject: 'index.html',
          httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
          priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
          // Grants CloudFront read access and writes the bucket policy for us.
          defaultBehavior: {
            origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
            // Honours the Cache-Control headers set at upload time below.
            cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            compress: true,
          },
          errorResponses: [
            {
              httpStatus: 403,
              responseHttpStatus: 200,
              responsePagePath: `/${basePath ? `${basePath}/` : ''}index.html`,
              ttl: Duration.seconds(10),
            },
            {
              httpStatus: 404,
              responseHttpStatus: 200,
              responsePagePath: `/${basePath ? `${basePath}/` : ''}index.html`,
              ttl: Duration.seconds(10),
            },
          ],
          ...(props.domainNames?.length
            ? {
                domainNames: props.domainNames,
                certificate: acm.Certificate.fromCertificateArn(
                  this,
                  'Certificate',
                  props.certificateArn!,
                ),
              }
            : {}),
        })

    /*
      The distribution that actually fronts this bucket, used for cache
      invalidation on deploy. Imported by id when it belongs to another stack —
      only the id is read for invalidation, so the domain name is a filler.
    */
    const servingDistribution = serving
      ? cloudfront.Distribution.fromDistributionAttributes(this, 'ServingDistribution', {
          distributionId: serving,
          domainName: `${serving}.cloudfront.net`,
        })
      : distribution!

    if (serving) {
      // The OAC equivalent of what `S3BucketOrigin.withOriginAccessControl`
      // writes automatically: let that distribution, and only it, read objects.
      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'AllowServingDistributionRead',
          principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
          actions: ['s3:GetObject'],
          resources: [bucket.arnForObjects(basePath ? `${basePath}/*` : '*')],
          conditions: {
            StringEquals: {
              'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${serving}`,
            },
          },
        }),
      )
    }

    // Two deployments, in this order, so a visitor never gets an index.html
    // pointing at assets that have not landed yet.
    //
    // Fingerprinted assets: safe to cache forever, and `prune` clears out old
    // builds. The exclude also protects index.html from being pruned here.
    const assets = new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [s3deploy.Source.asset(props.siteDist)],
      destinationBucket: bucket,
      destinationKeyPrefix: basePath || undefined,
      exclude: ['index.html'],
      // Scoped to this prefix, so it can never reach anything else that may
      // live in the bucket.
      prune: true,
      cacheControl: [
        s3deploy.CacheControl.setPublic(),
        s3deploy.CacheControl.maxAge(Duration.days(365)),
        s3deploy.CacheControl.immutable(),
      ],
    })

    // The entry point: never cached, and the only path worth invalidating.
    const html = new s3deploy.BucketDeployment(this, 'DeployHtml', {
      sources: [s3deploy.Source.asset(props.siteDist)],
      destinationBucket: bucket,
      destinationKeyPrefix: basePath || undefined,
      exclude: ['*'],
      include: ['index.html'],
      prune: false,
      cacheControl: [
        s3deploy.CacheControl.noCache(),
        s3deploy.CacheControl.mustRevalidate(),
      ],
      distribution: servingDistribution,
      // Both forms of the entry URL, since each is a separately cached object.
      distributionPaths: basePath
        ? [`/${basePath}`, `/${basePath}/`, `/${basePath}/index.html`]
        : ['/', '/index.html'],
    })
    html.node.addDependency(assets)

    if (props.githubRepo) {
      this.addGitHubDeployRole(props.githubRepo, props.createOidcProvider ?? false)
    }

    new CfnOutput(this, 'BucketName', { value: bucket.bucketName })
    new CfnOutput(this, 'BucketRegionalDomainName', {
      value: bucket.bucketRegionalDomainName,
      description: 'Use as the origin domain on the serving distribution',
    })
    new CfnOutput(this, 'BasePath', { value: `/${basePath}` })

    if (distribution) {
      new CfnOutput(this, 'DistributionId', { value: distribution.distributionId })
      new CfnOutput(this, 'SiteUrl', {
        value: `https://${distribution.distributionDomainName}/${basePath}`,
      })
    }
    if (props.domainNames?.length) {
      new CfnOutput(this, 'CustomDomainUrl', {
        value: `https://${props.domainNames[0]}/${basePath}`,
      })
    }
  }

  /**
   * A role GitHub Actions can assume with no long-lived keys. Because CI runs
   * `cdk deploy`, the role's job is to assume the CDK bootstrap roles rather
   * than to touch S3 and CloudFront directly.
   */
  private addGitHubDeployRole(githubRepo: string, createProvider: boolean): void {
    const providerUrl = 'https://token.actions.githubusercontent.com'

    const provider = createProvider
      ? new iam.OpenIdConnectProvider(this, 'GitHubOidcProvider', {
          url: providerUrl,
          clientIds: ['sts.amazonaws.com'],
        })
      : iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          'GitHubOidcProvider',
          `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
        )

    const role = new iam.Role(this, 'DeployRole', {
      roleName: `${this.stackName}-deploy`,
      description: `Deploys ${this.stackName} from GitHub Actions`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        // Scope to one repo. Tighten to `repo:owner/name:ref:refs/heads/main`
        // if deploys should only ever come from main.
        StringLike: { 'token.actions.githubusercontent.com:sub': `repo:${githubRepo}:*` },
      }),
    })

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    )

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn })
  }
}

# Brickwords

A word puzzle built from tetromino-shaped bricks. Each brick carries one letter
per cell; drop them all into the grid and every row spells a word. What the
words have in common is never stated — you get a cryptic clue instead, and the
theme is only revealed once you solve it (or give up).

A brick can fit geometrically and still be in the wrong place. That is the
puzzle.

TypeScript · React · Tailwind · Vite, deployed to S3 + CloudFront with AWS CDK.

## Running it

Yarn 4, pinned by the `packageManager` field. If you do not have it yet,
`corepack enable` will put the right version on your path.

```bash
yarn install
yarn dev
```

The CDK app in `infra/` is a Yarn workspace, so that one `yarn install` covers
both it and the web app.

| Script                 | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `yarn dev`             | Dev server on http://localhost:5173           |
| `yarn build`           | Typecheck and build to `dist/`                |
| `yarn test`            | Game-logic tests (vitest)                     |
| `yarn lint`            | oxlint                                        |
| `yarn check`           | lint + test + build                           |
| `yarn infra:typecheck` | Typecheck the CDK app                         |
| `yarn diff`            | Build, then show what a deploy would change   |
| `yarn deploy`          | Build and deploy to AWS (see below)           |

## How it fits together

The game logic is plain TypeScript with no React in it, so it is all directly
testable:

| File                  | Responsibility                                                     |
| --------------------- | ------------------------------------------------------------------ |
| `src/game/types.ts`   | Core types: `Brick`, `Puzzle`, `Placement`, `DragState`             |
| `src/game/puzzles.ts` | Themes, clues, word lists, and laying words out as centred rows     |
| `src/game/carve.ts`   | Cuts a finished grid into connected polyominoes                     |
| `src/game/polyomino.ts` | Shape maths: normalise, rotate, bounds                           |
| `src/game/engine.ts`  | Placement legality, solved-row detection, win check                 |
| `src/game/rng.ts`     | Seeded PRNG, so a puzzle id always carves the same bricks           |
| `src/hooks/useBrickDrag.ts` | Pointer-event drag, rotation, and drop validation             |
| `src/hooks/useCellSize.ts` | Sizing tiles to the space available                           |
| `src/components/`     | `Board`, `Tray`, `BrickView`                                        |

### Layout

The app is a fixed-height CSS grid (`.game-layout` in `index.css`), not a
scrolling page. That is a gameplay requirement rather than a style choice: the
board and the brick tray have to be on screen together, or reaching for a brick
scrolls the board out of view.

Tiles are sized at runtime to fill whatever the board's container has left over,
so one layout covers a small phone and a desktop. Two things follow from that
and are easy to break:

- The measured container carries **no padding of its own**. `getBoundingClientRect`
  reports the border box, so padding on it reads as usable space and the last
  column overflows.
- The tray's tile size comes from the **viewport**, never from the board's. The
  tray's height is part of what leaves room for the board, so deriving one from
  the other makes each depend on the other.

Viewports too short to stack — landscape phones — put the board *beside* the
clue and tray instead, using the same DOM via grid areas. The `short:` variant
trims the chrome below 700px of height. `useCellSize.test.ts` checks real phone
sizes against the measured chrome budget, so shrinking the board below a
tappable tile fails the build.

### Puzzle generation

A puzzle starts as a word list. Each word becomes a centred row, so every row
overlaps the middle column and the filled area stays connected. `carve` then
partitions those cells into bricks: it grows a region from a random seed cell,
absorbing random frontier cells until it hits a target size, and folds any
undersized leftover into its smallest neighbour. Bricks record the position
they were cut from, which is the only reliable way to know where a brick truly
belongs — the same letters in the same shape can fit in more than one place.

Carving is seeded off the puzzle id, so it is deterministic: the same puzzle
always produces the same bricks, and nothing about the layout has to be stored.

### Adding a puzzle

Append to `PUZZLE_SPECS` in `src/game/puzzles.ts`:

```ts
{
  id: 'birds',
  theme: 'Birds',
  clue: 'Feathered things, one of which robs the nest of another.',
  blurb: 'Shown once the puzzle is solved, to explain the clue.',
  words: ['FALCON', 'MAGPIE', 'HERON', 'ROBIN'],
  difficulty: 'medium',
}
```

The `clue` is what players actually see; `theme` stays hidden until they solve
the puzzle or press "Give up on the clue". A clue should gesture at the theme
sideways rather than describe it — and it must not contain the theme's own words
or any of the answers. There are tests for exactly that, so a leaky clue fails
the build rather than quietly spoiling the puzzle.

Difficulty sets brick size and whether rotation is allowed: `easy` gives large
bricks and no rotation, `hard` gives small bricks that can be turned. The tests
run every invariant against every puzzle in the list, so a new entry is checked
automatically.

## Deploying to AWS

Infrastructure lives in `infra/` as a CDK app (TypeScript). It creates a private
S3 bucket served by CloudFront through Origin Access Control, and deploys the
built site as part of the same stack — so one command ships both.

| File                            | What it holds                          |
| ------------------------------- | -------------------------------------- |
| `infra/bin/app.ts`              | Entry point, reads config from context |
| `infra/lib/brickwords-stack.ts` | Bucket, distribution, upload, IAM      |

### First time

CDK needs a one-off bootstrap per account/region:

```bash
yarn infra:bootstrap
```

### Deploy

```bash
yarn deploy
```

That builds the site, synthesises the stack, and deploys. The site URL is
printed as the `SiteUrl` output. To preview changes first:

```bash
yarn diff
```

### Configuration

Every option is optional and can be passed as CDK context (`-c key=value`) or as
an environment variable:

| Context              | Env var                | Purpose                                     |
| -------------------- | ---------------------- | ------------------------------------------- |
| `stackName`          | `STACK_NAME`           | Stack name (default `Brickwords`)           |
| `domainNames`        | `DOMAIN_NAMES`         | Comma-separated custom domains              |
| `certificateArn`     | `CERTIFICATE_ARN`      | ACM cert ARN, **must be in us-east-1**      |
| `githubRepo`         | `GITHUB_REPO`          | `owner/repo` to create a CI deploy role for |
| `createOidcProvider` | `CREATE_OIDC_PROVIDER` | `true` if the account has no GitHub OIDC provider yet |

```bash
yarn deploy -c githubRepo=you/your-repo -c createOidcProvider=true
```

Region and account come from your AWS profile, so `AWS_PROFILE` and
`AWS_REGION` work as usual.

### How uploads are cached

The stack runs two uploads in order. Fingerprinted assets go first with a
one-year immutable cache; `index.html` follows with `no-cache` and triggers the
CloudFront invalidation. Ordering it that way means a visitor never receives an
index that references assets which have not landed yet. Only `index.html` is
invalidated, because everything else is content-hashed.

Old assets are pruned on each deploy, and the bucket is versioned, so a bad
deploy is recoverable.

### Continuous deployment (optional)

`.github/workflows/deploy.yml` builds, tests, and deploys on every push to
`main`, authenticating with OIDC so there are no long-lived AWS keys.

Deploy once locally with `-c githubRepo=owner/repo` to create the role, then set
these under **Settings → Environments → production**:

| Variable              | Value                                             |
| --------------------- | ------------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` from the stack outputs            |
| `AWS_REGION`          | e.g. `eu-west-1`                                  |
| `STACK_NAME`          | Only if you changed it from `Brickwords`          |
| `DOMAIN_NAMES`        | Only if using a custom domain                     |
| `CERTIFICATE_ARN`     | Only if using a custom domain                     |

The role can assume the CDK bootstrap roles rather than holding S3 and
CloudFront permissions directly, which is what lets CI run `cdk deploy`.

### Serving at bhaviktanna.dev/brickwords

The game is served by the CloudFront distribution that already fronts the CV
(`E3H1QIBL15I14G`), because that distribution owns the apex domain. This stack
owns the bucket; the CV stack owns the distribution.

The wiring on the CV side is already committed in the **`cv` repo**
(`infra/lib/infra-stack.ts`) — a second origin, two cache behaviours and a
viewer-request function. Nothing needs doing by hand in the console.

Files are deployed under a `brickwords/` key prefix matching Vite's `base`, so
CloudFront forwards the request URI to S3 unchanged and assets need no rewriting.

#### Deploy order

The game stack goes first, so the bucket exists before the distribution is
pointed at it:

```bash
yarn deploy
```

Then, in the `cv` repo:

```bash
yarn deploy
```

Deploying the CV first is not harmful, just briefly broken: the new origin would
point at a bucket that does not exist yet, and `/brickwords` would fall back to
the CV.

Afterwards, only the game stack needs redeploying for game changes — it
invalidates `/brickwords`, `/brickwords/` and `/brickwords/index.html` on the CV
distribution as part of the deploy.

The serving distribution id is **baked into `infra/bin/app.ts` as the default**,
not a flag you have to remember. That is a deliberate response to getting it
wrong once: as an opt-in flag, a plain `yarn deploy` built a second distribution
and wrote a bucket policy naming only that one, locking the CV distribution out
of the bucket. Every command reported success and the URL served the CV. To put
the game on its own distribution instead:

```bash
yarn deploy -c standalone=true
```

#### Why two cache behaviours and a function

Both details are easy to get wrong and both fail by silently serving the CV:

- A path pattern of `/brickwords/*` does **not** match `/brickwords`. Without a
  second exact-match behaviour, the bare URL falls through to the default
  behaviour and renders the CV.
- CloudFront's `defaultRootObject` only resolves `/`. It does nothing for
  `/brickwords/`, so S3 is asked for a key that does not exist, 404s, and the
  distribution's custom error response serves the CV's `index.html`. **Custom
  error responses are distribution-wide, not per-behaviour**, so they cannot be
  overridden for this path. The viewer-request function stops the origin 404ing
  in the first place.

The function's source of truth is [`infra/cloudfront/rewrite-index.js`](infra/cloudfront/rewrite-index.js),
which has unit tests. The CV stack carries an inline copy, because that repo's
`infra/.gitignore` excludes `*.js` and a file there would not be committed —
keep the two in step.

#### Constraints worth remembering

- **Same region.** The CV stack imports this bucket by name, and CDK builds the
  origin domain from *its own* stack region. Both are `us-east-1`.
- **Shared bucket name.** `bhaviktanna-brickwords-site` is a literal in both
  repos, since the stacks deploy independently and cannot reference each other.
- **403s and 404s both look like the CV.** The CV distribution returns its
  `index.html` with a **200** for anything its origin will not serve — including
  an S3 *permission* failure, not just a missing file. So a bucket policy that
  does not name the CV distribution presents identically to "the route was never
  set up": the domain serves the CV and nothing reports an error anywhere.

  To tell those apart, request an asset you know exists in S3:

  ```bash
  curl -sI https://bhaviktanna.dev/brickwords/assets/<hashed>.js | head -3
  ```

  `content-type: text/html` at ~1.2KB means the origin refused and you are
  looking at the CV's HTML under a JavaScript URL. Then compare the bucket
  policy's `AWS:SourceArn` with the CV distribution id.

### Custom domain

Request an ACM certificate in **us-east-1** (CloudFront reads certificates only
from that region), then:

```bash
yarn deploy -c domainNames=play.example.com -c certificateArn=arn:aws:acm:us-east-1:...
```

Point a DNS record at the distribution domain from the stack outputs. The stack
fails fast if you pass a domain without a certificate.

### Tearing down

```bash
yarn destroy
```

The bucket is set to retain, so it and its contents survive a stack delete;
remove it by hand if you really want it gone.

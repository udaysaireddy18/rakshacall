# RakshaCall deployment

## Live URLs

| Target | URL | Status |
| --- | --- | --- |
| Vercel (HTTPS) | https://rakshacall-henna.vercel.app | Working; use this for microphone access |
| GitHub Pages custom domain | http://www.rakshacall.udaysaireddy.dev | App is live; GitHub TLS certificate is still provisioning |
| GitHub Pages project URL | https://udaysaireddy18.github.io/rakshacall/ | Redirects to the custom domain |

The Vercel project is named `rakshacall` under the `uday-695e` team. The
custom domain `www.rakshacall.udaysaireddy.dev` has also been added to that
project, but its DNS still points at GitHub Pages.

## GitHub Pages deployment

Every push to `main` runs `.github/workflows/pages.yml`, which:

1. installs dependencies with `npm ci`
2. runs `npm run test:dsp`
3. builds with `npm run build`
4. publishes `dist/` through GitHub Actions Pages

The build uses a relative Vite base (`base: './'`) and relative PWA paths, so
it works at both the domain root and `/rakshacall/`.

The custom domain is set to `www.rakshacall.udaysaireddy.dev` in Pages, and
`public/CNAME` keeps the domain in the deployed artifact.

### HTTPS status on the custom domain

GitHub's Pages DNS health check reports the domain as valid, served by Pages,
and eligible for HTTPS, but the certificate is stuck at state `new` with
`peer_failed_verification`:

```
$ curl -I https://www.rakshacall.udaysaireddy.dev/
curl: (60) schannel: SNI or certificate check failed: SEC_E_WRONG_PRINCIPAL
```

The TLS handshake currently serves `CN=*.github.io`, not a certificate for the
custom domain. The custom domain was removed and re-added once to restart
provisioning. GitHub documents that certificate provisioning can take up to
24 hours; it may require opening a GitHub Support ticket if it stays at `new`.

## Making the custom domain HTTPS immediately

The Vercel project is ready to serve the custom domain. Change the existing
`www.rakshacall` DNS record at Name.com:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `www.rakshacall` | `8904aaa13e65a0b5.vercel-dns-017.com.` | Default |

The fallback value `cname.vercel-dns.com.` also works. After DNS propagates,
Vercel provisions a certificate automatically and serves the app at:

```
https://www.rakshacall.udaysaireddy.dev/
```

Then run:

```sh
vercel domains verify www.rakshacall.udaysaireddy.dev --scope uday-695e
```

Do not remove the GitHub Pages deployment until the Vercel domain is verified.

## APK download

`public/downloads/RakshaCall.apk` is intentionally not committed. Until a
signed APK is added, the install screen checks for it and falls back to the
web-install path instead of showing a fake download.

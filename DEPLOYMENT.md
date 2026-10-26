# RakshaCall deployment

## Live URLs

| Target | URL | Status |
| --- | --- | --- |
| GitHub Pages custom domain | https://www.rakshacall.udaysaireddy.dev | Working HTTPS |
| Vercel HTTPS mirror | https://rakshacall-henna.vercel.app | Working HTTPS |
| GitHub Pages project URL | https://udaysaireddy18.github.io/rakshacall/ | Redirects to the custom domain |

The GitHub Pages custom domain is the primary deployment. The Vercel
deployment is an independent HTTPS mirror and is not automatically updated by
pushes to GitHub.

## Verified on the custom domain

- `http://` redirects with `301` to `https://`
- TLS certificate: `CN=www.rakshacall.udaysaireddy.dev`, issued by Let's Encrypt
- Certificate validity: through 24 January 2027
- `window.isSecureContext === true`, so microphone access is available
- Service worker active at scope `/`
- `manifest.webmanifest` returns `200`
- Guard route loads with no console errors
- Full-width sticky top navigation, no sidebar, no horizontal overflow

## GitHub Pages deployment

Every push to `main` runs `.github/workflows/pages.yml`, which:

1. installs dependencies with `npm ci`
2. runs `npm run test:dsp`
3. builds with `npm run build`
4. publishes `dist/` through GitHub Actions Pages

The build uses a relative Vite base (`base: './'`) and relative PWA paths, so it
works at the domain root and at `/rakshacall/`.

The custom domain is set to `www.rakshacall.udaysaireddy.dev` in Pages, and
`public/CNAME` keeps the domain in the deployed artifact. GitHub's Pages API
reports `https_certificate.state=approved` and `https_enforced=true`.

The certificate took longer to provision than expected. It was stuck at state
`new` while GitHub served the `*.github.io` certificate. The domain was removed
and re-added once to restart provisioning; GitHub then issued the certificate
and enabled HTTPS enforcement automatically. No DNS change from Name.com is
currently needed.

## Vercel mirror

The Vercel project is named `rakshacall` under the `uday-695e` team.

The project also has a standby attachment for
`www.rakshacall.udaysaireddy.dev`. Keep the Name.com CNAME pointed at
`udaysaireddy18.github.io` while GitHub Pages is healthy. If GitHub Pages ever
loses HTTPS again, the custom domain can be switched to Vercel by changing the
`www.rakshacall` CNAME to `8904aaa13e65a0b5.vercel-dns-017.com.` (fallback:
`cname.vercel-dns.com.`).

Redeploy the mirror manually:

```sh
vercel --prod --scope uday-695e
```

## APK download

`public/downloads/RakshaCall.apk` is intentionally not committed. Until a
signed APK is added, the install screen checks for it and falls back to the
web-install path instead of showing a fake download.

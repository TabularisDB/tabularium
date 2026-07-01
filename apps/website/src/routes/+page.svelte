<script lang="ts">
  import Nav from '$components/Nav.svelte'
  import Hero from '$components/Hero.svelte'
  import Features from '$components/Features.svelte'
  import Manifest from '$components/Manifest.svelte'
  import HowItWorks from '$components/HowItWorks.svelte'
  import Closer from '$components/Closer.svelte'
  import Footer from '$components/Footer.svelte'
</script>

<svelte:head>
  <title>Tabularium — The Self-Hosted Plugin Registry You Control</title>
  <meta
    name="description"
    content="A complete self-hosted plugin registry. OAuth submission across GitHub, GitLab, Gitea, Forgejo. Release-tracked versioning. Typed catalog API. Deploys with one Docker command."
  />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="googlebot" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#6366f1" />
  <meta property="og:title" content="Tabularium — The Self-Hosted Plugin Registry You Control" />
  <meta
    property="og:description"
    content="A complete self-hosted plugin registry. OAuth submission across GitHub, GitLab, Gitea, Forgejo. Release-tracked versioning. Typed catalog API."
  />
  <meta property="og:image" content="https://tabularium.wiki/assets/banner.svg" />
  <meta property="og:image:type" content="image/svg+xml" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Tabularium — self-hosted plugin registry" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://tabularium.wiki/" />
  <meta property="og:site_name" content="Tabularium" />
  <meta property="og:locale" content="en_US" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Tabularium — The Self-Hosted Plugin Registry You Control" />
  <meta
    name="twitter:description"
    content="A complete self-hosted plugin registry. OAuth submission across GitHub, GitLab, Gitea, Forgejo. Release-tracked versioning. Typed catalog API."
  />
  <meta name="twitter:image" content="https://tabularium.wiki/assets/banner.svg" />
  <meta name="twitter:image:alt" content="Tabularium — self-hosted plugin registry" />
  <link rel="canonical" href="https://tabularium.wiki/" />
</svelte:head>

<Nav />
<Hero />
<Features />
<Manifest />
<HowItWorks />
<Closer />
<Footer />

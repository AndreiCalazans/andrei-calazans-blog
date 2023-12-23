export default {
  title: "NPM & Yarn Private Package Registry Personal Mistakes",
  tags: ['npm', 'yarn', 'private registry'],
  spoiler: 'While working on a client project, I ran into an issue with their private registry. I kept seeing the unauthorized error when I ran `yarn install`. It was a weird issue especially because I had all of the correct keys. After some investigation I found out I was using the wrong `_auth` value.',
  getContent: () => import('./document.mdx'),
}


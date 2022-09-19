import * as Navi from 'navi'

export default Navi.route({
  title: 'Daily',
  getView: () => import('./daily.mdx'),
})

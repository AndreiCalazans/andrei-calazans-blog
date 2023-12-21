#!/bin/bash
set -eo pipefail

echo 'hello'

routes=$(fd '.*weekly')

# Step one: Take the weekly posts and move them to thoughtfulLounge/src/pages
for route in $routes; do
  folder=$(basename $route)
  mv $route thoughtfulLounge/src/pages/$folder
done


# Step two: Take the exported object and convert to frontmatter
for page in thoughtfulLounge/src/pages/*weekly; do
  date=$(basename $page | cut -d- -f1)
  object=$(cat $page/post.ts | grep -E 'title|tags|spoiler' | sed 's/export default {//g' | sed 's/};//g')
  frontmatter="---\ntitle: $(echo "$object" | grep title | cut -d: -f2 | sed 's/"//g')\npublishDate: $date\n$(echo "$object" | grep tags | sed 's/tags://g')\n---"
  echo "$frontmatter" > $page/index.md
done

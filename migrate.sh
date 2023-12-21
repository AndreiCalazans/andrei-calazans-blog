#!/bin/bash
set -eo pipefail

echo 'hello'

# routes=$(fd '.*weekly')

# Step one: Take the weekly posts and move them to thoughtfulLounge/src/pages
# for route in $routes; do
#   folder=$(basename $route)
#   mv $route thoughtfulLounge/src/pages/$folder
# done


# # Step two: Take the exported object and convert to frontmatter
for page in thoughtfulLounge/src/content/post/*weekly; do
  date=$(basename $page | cut -c 1-10)
  echo $(fd -t f 'post.*' $page)
  object=$(fd -t f 'post.*' $page | xargs cat)
  echo "what $object"
  title=$(echo "$object" | grep title | cut -d: -f2 | sed 's/"]//g' | sed 's/,$//g')
  tags=$(echo "$object" | grep tags | sed 's/tags://g' | sed 's/,$//g')
  frontmatter="---\ntitle: $title\npublishDate: "$date"\ntags: $tags\n---"

  sed -i '' "s/\$frontmatter/$frontmatter/g" "$page/index.mdx"

  # echo "$frontmatter"  > $tmpfile
  # cat $page/index.md >> $tmpfile
  # mv $tmpfile $page/index.md
done

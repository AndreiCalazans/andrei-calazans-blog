#!/bin/bash
set -eo pipefail

echo 'hello'


# Steps 
#
# Step one:
# Take the weekly posts and move them to 
# thoughtfulLounge/src/pages
#
# Step two:
# Take the exported object from post.ts inside
# the weekly folder and move it to the md or mdx file in the format of
# Frontmatter
#
# example:
# The object in post.ts
#
# export default {
#   title: "React Native Weekly - W35 2021",
#   tags: ["react-native", "react-native-weekly"],
#   spoiler: "",
#   getContent: () => import("./document.mdx"),
# };
#
# will be turned into:
#
# title: "React Native Weekly - W35 2021"
# publishDate: "30 January 2023"
# description: ""
# tags: ["react-native", "react-native-weekly"]
# 
# attention, the publishDate will be retrieved from the folder name
# example:
# When folder is src/routes/posts/2022-01-17-react-native-weekly/ 
# the publishDate is 17 January 2022
#

routes=$(fd '.*weekly')

echo $routes
# Example of routes
# src/routes/posts/2022-01-17-react-native-weekly/
# src/routes/posts/2022-01-24-react-native-weekly/
# src/routes/posts/2022-01-30-react-native-weekly/
# src/routes/posts/2022-02-07-react-native-weekly/
# src/routes/posts/2022-02-27-react-native-weekly/
# src/routes/posts/2022-03-06-react-native-weekly/
# src/routes/posts/2022-03-22-react-native-weekly/

# thoughtfulLounge/src/pages/posts/[slug].astro

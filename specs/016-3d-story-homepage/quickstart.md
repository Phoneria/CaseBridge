# Quickstart
```
cd <tmp> && npm i three@0.187.0 esbuild
npx esbuild specs/016-3d-story-homepage/source/story3d.src.js --bundle --format=esm --minify --target=es2022 --legal-comments=eof --outfile=web-page/story3d.js
cd web-page && python3 -m http.server 8081 --bind 127.0.0.1
python3 -m unittest scripts.tests.test_story_3d
```

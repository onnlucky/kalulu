dist/kalulu.min.js: dist/kalulu.js
	minify dist/kalulu.js

dist/kalulu.js: lib.js libg.js
	mkdir -p dist/
	tsc --allowJs --out $@ $^

# Third-party notices

This file records the runtime dependency currently included in the prototype.
The Vite build includes this file as `dist/THIRD_PARTY_NOTICES.md`; retain it
when distributing the built application. This notice does not choose a license
for the project's own code.

No external 3D models, images, textures, or audio have been integrated yet.
Before adding them, record their source, license, attribution, and permission
to redistribute both source files and exported game assets.

## three.js

- Installed version reviewed: 0.187.0
- Upstream: <https://github.com/mrdoob/three.js>
- License text below copied from the installed package's `LICENSE` file.

The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Development dependencies

The direct development dependencies reviewed are `@types/node`, `@types/three`, `fast-check`,
`vite`, and `vitest` (MIT), and `typescript` (Apache-2.0), according to their
installed package metadata. They are not shipped in the current runtime build.
Keep their package-provided notices if distributing those tools or their source.
Revisit this inventory when dependencies or bundled assets change.

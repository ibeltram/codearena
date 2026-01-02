# Extension Icon Requirements

## VS Code Marketplace Requirements

The VS Code Marketplace requires a **PNG icon** for the extension listing.

### Specifications
- Format: PNG
- Size: 128x128 pixels minimum (256x256 recommended)
- Background: Transparent or solid color
- Location: `resources/icon.png`

### Current Status
- We have `icon.svg` for in-IDE display
- Need to generate `icon.png` for marketplace

### Generating icon.png

Using ImageMagick:
```bash
convert -background none -density 256 icon.svg -resize 256x256 icon.png
```

Using Inkscape:
```bash
inkscape -w 256 -h 256 icon.svg -o icon.png
```

Using rsvg-convert (librsvg):
```bash
rsvg-convert -w 256 -h 256 icon.svg > icon.png
```

### In CI/CD
The release workflow will automatically generate the PNG from SVG if not present.

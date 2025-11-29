# Sofia Pro Font Files

## Adding Sofia Pro to the Platform

To use Sofia Pro as the platform's font, you need to add the font files to this directory.

### Required Font Files

Please add the following Sofia Pro font files in **WOFF2 format** (recommended for web performance):

1. **SofiaPro-Light.woff2** - Font weight 300
2. **SofiaPro-Regular.woff2** - Font weight 400
3. **SofiaPro-Medium.woff2** - Font weight 500
4. **SofiaPro-SemiBold.woff2** - Font weight 600
5. **SofiaPro-Bold.woff2** - Font weight 700
6. **SofiaPro-Black.woff2** - Font weight 900

### Alternative Formats

If you don't have WOFF2 files, you can also use:
- `.woff` files (slightly larger file size)
- `.ttf` or `.otf` files (not recommended for web, larger file size)

If using different formats, update the paths in `/src/app/fonts.ts` accordingly.

### Where to Get Sofia Pro

Sofia Pro is a premium font that needs to be purchased from:
- [MyFonts](https://www.myfonts.com/fonts/mostardesign/sofia-pro/)
- [Adobe Fonts](https://fonts.adobe.com/fonts/sofia) (if you have Creative Cloud)
- [Font Spring](https://www.fontspring.com/fonts/mostardesign/sofia-pro)

### Converting Font Files

If you have `.ttf` or `.otf` files and need to convert them to `.woff2`:

1. Use online converters:
   - [CloudConvert](https://cloudconvert.com/ttf-to-woff2)
   - [Convertio](https://convertio.co/ttf-woff2/)

2. Or use command-line tools:
   ```bash
   # Install woff2 tools
   npm install -g ttf2woff2
   
   # Convert TTF to WOFF2
   ttf2woff2 SofiaPro-Regular.ttf SofiaPro-Regular.woff2
   ```

### Fallback Font

If Sofia Pro files are not added, the platform will automatically fall back to system fonts:
- Apple devices: San Francisco
- Windows: Segoe UI
- Others: Default system font

### Usage in Components

Once the fonts are added, you can use Sofia Pro in your components:

```jsx
// Using Tailwind class
<h1 className="font-sofia">Hello World</h1>

// Or it's already the default font for the entire app
<p>This text uses Sofia Pro by default</p>
```

### File Size Optimization

For best performance:
- Use WOFF2 format (30-50% smaller than TTF)
- Consider using only the weights you need
- Subset fonts if you don't need all characters

### License

Make sure you have the appropriate license for Sofia Pro for web usage. Most licenses require a separate web font license.

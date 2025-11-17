# MeetNote Desktop Assets

This folder contains the icons and assets for the MeetNote desktop application.

## Required Assets

You'll need to create or add these files:

### Icons
- `icon.png` - Main app icon (512x512px)
- `icon.icns` - macOS app icon bundle
- `tray-icon.png` - System tray icon (16x16px or 32x32px)

### Creating Icons

1. **Main App Icon (`icon.png`)**
   - Size: 512x512px
   - Format: PNG with transparency
   - Design: MeetNote logo or microphone/meeting themed icon

2. **macOS Icon Bundle (`icon.icns`)**
   - Use tools like `iconutil` or online converters
   - Convert from icon.png to .icns format
   - Command: `iconutil -c icns icon.iconset`

3. **Tray Icon (`tray-icon.png`)**
   - Size: 16x16px or 32x32px (for Retina)
   - Format: PNG with transparency
   - Design: Simple, monochrome version of main icon
   - Should work well in both light and dark menu bars

## Temporary Placeholder

For now, you can use any PNG image as a placeholder. The app will still work without proper icons, but they'll improve the user experience.

## Icon Resources

- SF Symbols (for macOS native look)
- Heroicons (https://heroicons.com/)
- Feather Icons (https://feathericons.com/)
- Custom design tools: Figma, Sketch, Canva

# EGIN development scope

Work on the website by default. The owner explicitly requests native Android/iOS builds only after the command «релиз» (release). Do not run APK/AAB/IPA builds or native sync during ordinary website changes. CI must not build native packages automatically on pushes or pull requests; the manual `build_native` input is reserved for an explicit release request.

Keep the phone-first layout, prominent 3D view, white and dark green palette, and safe-area spacing. Active bottom navigation changes icon/text colour, without a filled tab background.

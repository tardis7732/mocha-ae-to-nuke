<p align="center">
  <strong>English</strong> · <a href="README.ko.md">한국어</a>
</p>

<h1 align="center">Mocha AE → Nuke</h1>

<p align="center">Copy tracking from After Effects. Paste a single node into Nuke.</p>

<p align="center">
  <a href="https://github.com/tardis7732/mocha-ae-to-nuke/tree/v1.0"><img src="https://img.shields.io/badge/version-1.0-526DDB" alt="Version 1.0"></a>
  <img src="https://img.shields.io/badge/platform-Windows-555555" alt="Windows">
</p>

<p align="center">
  <a href="https://github.com/tardis7732/mocha-ae-to-nuke/archive/refs/heads/main.zip"><strong>Download ZIP</strong></a> ·
  <a href="#quick-start">Quick start</a> · <a href="#settings">Settings</a>
</p>

<p align="center">
  <img src="images/english.jpg" alt="English interface — Mocha AE to Nuke v1.0" width="607">
</p>

Export Mocha tracking applied in AE as **CornerPin2D** or **Transform**. Reference-frame correction is included in one node, with a single **Copy to clipboard** button. No `.nk` save step.

## Quick start

1. **Download and extract** the ZIP. Choose the English or Korean JSX script. No additional executable is required.
2. In AE, enable **Preferences → Scripting & Expressions → Allow Scripts to Write Files and Access Network**.
3. Track in Mocha AE, save, and return to AE. Use **Create Track Data**, select the tracked layer, then **Apply Export** with **Corner Pin** or **Transform**.
4. Select the layer receiving the keyframes. Open **File → Scripts → Run Script File…** and run [`Mocha_AE_to_Nuke_EN.jsx`](Mocha_AE_to_Nuke_EN.jsx).
5. Choose the node type, frame range and reference frame. Click **Copy to clipboard**, then press **Ctrl+V** in the Nuke node graph.

## Settings

| Setting | What it does |
| --- | --- |
| **AE start / end frame** | Export range, including the end frame. AE frame numbers count from **0** at the composition start. |
| **Nuke start frame** | Frame number for the first exported key. Default: **1**. |
| **Reference frame** | AE frame used as the motion reference. Default: **0**. Must be inside the export range. |
| **Mocha coordinates** | Uses the exported corner coordinates directly. Suitable for tracking received on a Null. |
| **Include layer transform** | Also applies the receiving AE layer's position, rotation and scale to the corners. |

Check the reference frame before copying. Match the Nuke input resolution and pixel aspect ratio to the AE composition, and position the input for that reference frame before applying the exported node.

## Included files

| File | Purpose |
| --- | --- |
| [`Mocha_AE_to_Nuke_EN.jsx`](Mocha_AE_to_Nuke_EN.jsx) | English interface |
| [`Mocha_AE_to_Nuke_KO.jsx`](Mocha_AE_to_Nuke_KO.jsx) | Korean interface |

<details>
<summary><strong>Compatibility and troubleshooting</strong></summary>

- Supports unparented 2D layers, standard Corner Pin and layer transforms. CC Power Pin, motion-blur Corner Pin, 3D and roto export are not supported.
- Keys are sampled at integer frames with linear interpolation. AE subframe motion and motion-blur rendering are not reproduced.
- Clipboard copying uses Windows PowerShell and a temporary text file. Enable the AE scripting permission above. Temporary data is checked before copying and removed afterward; a second process verifies the copied text. No installer or network requests.
- If copying fails, check the message in the dialog. File access errors, empty data and verification failures are reported instead of success.
- Screenshots show the actual AE dialog with a sample layer. Numerical and PowerShell transport tests passed with a mock clipboard. The complete AE-to-Nuke paste and render workflow has not been verified.

</details>

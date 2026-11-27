# M0 device checklist (Manta, Chauvet 3.31.45)

Allow 30–45 minutes. Write down the step number for anything odd, any dialog
that never appears within 2 minutes, or any crash.

Use your **finger** in the Puzzles menu. Pen strokes on that screen land in
the note underneath.

## A. Install

1. Download the build: open the latest green CI run on the `m0-probe` branch
   (GitHub → Actions → CI), scroll to **Artifacts**, download
   `SupernotePuzzles-v0.0.1-10NN`. **Don't unzip it**: the Supernote unpacks
   it when you install.
2. Copy the downloaded file to the Manta's `MyStyle/` folder (USB, Supernote
   Partner or Browse & Access).
3. Settings → Apps → Plugins → **Add Plugin** → choose it (not Reinstall).
4. Restart the Manta once (other plugins saw listeners fire twice after a
   reinstall without a restart).
5. Turn Wi-Fi on. The first handwriting recognition may need it (error 116).

## B. Setup

6. Open any note. Tap the **Puzzles** button in the toolbar. The Probes menu
   opens.
7. Tap **Environment info**. When asked for permissions, choose the "always"
   option. Note what each permission dialog says.
8. Tap **Create probe note**. A note "Probe <date time>" should open, with 3
   pages.

## C. P3 template (look before writing)

9. Go to page 3 (the crossword). Answer:
   - Are all four black corner marks fully visible at the page edges?
   - Is anything hidden under the toolbar?
   - Is the grid sharp? Which clue-number size (18 / 22 / 26 / 30) reads best?
   - Which line weights (1–6 px) look right for grid lines?
   - Can you tell the two greys apart?
   - Take a photo if anything looks off.

## D. P1 recognition

Don't save the note during this section.

10. Page 1: write a capital letter in every box (A–Z large, then A–Z
    crossword-size), as you normally would. Tap **READ** with your finger.
    After 30–60 s a dialog shows the results. Write it down or photograph
    it.
11. Page 2: write the six Wordle words, one letter per box, and the four
    words on the lines as printed (two in capitals, two in lower case). Leave
    the "P6 marks" box empty. Tap **READ** and note the dialog.
12. Page 3: write about ten letters in the grid, as a couple of across words.
    Tap **READ** and note the dialog.

## E. P2 coordinates

13. Menu → **P2 Coordinates → Arm**. Close the menu.
14. On page 3, draw **one straight line** across the "P2 target" box with
    your usual pen.
15. Pick the lasso tool, draw a lasso loop anywhere on page 3, then cancel
    the selection.
16. Menu → **P2 Coordinates → Report**. Note the result.

## F. P4 page buttons

17. Menu → **P4 Page buttons → Log taps**. Close the menu.
18. On the probe note, tap **TAP** with your finger: you should see
    "TAP received (finger)". Then tap it with the pen tip: "TAP received
    (pen)".
19. Press on TAP and drag well outside it before lifting. Nothing should
    happen.
20. Open something that covers the TAP button (a toolbar menu or panel,
    whatever reaches the bottom-left), then tap a menu item over TAP.
    Did the plugin react? Note what you opened.
21. Open a different, ordinary note and tap the bottom-left corner where TAP
    would be. Nothing should happen.
22. Go back to the probe note and tap TAP once more. It should still work.

## G. P5 network

23. Menu → **P5 Network → Fetch today's feeds**. Allow Internet access.
    Note the result. The log never contains the answers.

## H. P6 feedback marks (page 2, the "P6 marks" box)

24. Go to page 2. Menu → **P6 Feedback → Insert marks**. The menu closes and
    a dialog reports what happened. Look at the box:
    - Do you see ✓, ✗, a square and a light grey tile inside the box?
    - Where did the **dark** grey tile appear (the host decides)?
    - Photograph the box, and the dark tile if it's elsewhere.
25. Press **Undo** once. What disappeared? Press Redo, or run Insert marks
    again, so the marks are back.
26. Menu → **P6 Feedback → Remove via lasso**. Did the marks vanish? Press
    **Undo**: do they come back?
27. Close the note (back to the file list), reopen it, go to page 2. Menu →
    **P6 Feedback → Status**. Did the removal stick?
28. Menu → **Insert marks** again, then **Remove via batch**. Check the
    box, press Undo once, close and reopen the note, then **Status**.
29. Write a small scribble on page 2 outside all boxes. Menu → **P6
    Feedback → Save note**. Then press Undo. Does the scribble disappear,
    i.e. does undo still work after saving?

## I. Send back

30. Menu → **Write log now**.
31. Send me:
    - `Document/SupernotePuzzles/log.txt`, and `log.prev.txt` if it exists.
    - Your answers to steps 9, 20, 24–29.
    - Photos: page 1 after writing, the P6 box after step 24, and anything
      that looked wrong.
    - If there's no log file: the menu's **Show log** screen, photographed.

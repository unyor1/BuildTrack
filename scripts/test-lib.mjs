// Tests for the pure editor helpers (geometry + layering). Run: pnpm test:lib  (needs Node 22.18+ for TypeScript imports).
import assert from "node:assert/strict"
import { areaSquareMeters, asPoints, bbox, formatArea, lengthMeters, limitPoints, polygonAreaPx, polylineLengthPx, pointsToPath, simplify, translatePoints } from "../src/lib/geometry.ts"
import { alignMoves, distributeMoves, fitImageBox, resizeFromCorner, resizedBox, inRectangle, isNoop, itemBox, shifted, shiftedTogether, withGroupMembers } from "../src/lib/arrange.ts"
import { angleFromCenter, arrowHeadPx, cloudPath, constrainAngle, dimensionTickPx, normalizeAngle, rectCorners, snapAngle, toLocalAxes } from "../src/lib/shapes.ts"
import { buildPdf } from "../src/lib/pdf.ts"
import { symbolByKey, symbolGroups, symbolLibrary } from "../src/lib/symbols.ts"
import { addDays, byZone, csvEscape, daysBetween, isDueSoon, isOverdue, projectHealth, sCurve, scheduleElapsed, summarize, toCsv } from "../src/lib/progress.ts"
import { fetchAll } from "../src/lib/paging.ts"
import { escapeHtml, reportHtml } from "../src/lib/printReport.ts"
import { reportableDates } from "../src/lib/reportFormat.ts"
import { buildZip, crc32, safeEntryName, textBytes } from "../src/lib/zipWriter.ts"
import { parseSettings, defaultSettings } from "../src/lib/settingsModel.ts"
import { MAX_ATTEMPTS, backoffSeconds, isNetworkProblem, sendOrder, summarizeQueue, verdictFor } from "../src/lib/offlineModel.ts"
import { pinLink, qrMatrix, qrSvg } from "../src/lib/qr.ts"
import { canFormat, decorations, displayLines, labelToSize, mergeFormat, resolveFormat, sanitizeFormat, sizeToLabel, transformText } from "../src/lib/textFormat.ts"
import { capsulePlacement, rotatedBounds } from "../src/lib/capsule.ts"
import { ageOn, detailsProblem, fileProblem, idTypeLabel, idTypes, maskedId } from "../src/lib/identityModel.ts"
import { PRIVACY_VERSION, privacyScopes } from "../src/lib/privacy.ts"
import { absoluteLink, appBase, buildEmail } from "../supabase/functions/_shared/emailModel.ts"
import { fixStageText, pinQualityWarning, qaBadge, checklistProblem, defaultDueDate, dueState, dueText, measureVerdict, previewScore, refNumber, toleranceText } from "../src/lib/qaModel.ts"
import { canMoveLayer, layerChanges, reorderIds, sortByLayer } from "../src/lib/layers.ts"

let passed = 0
const test = (name, fn) => {
  try {
    fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (error) {
    console.log(`  FAIL ${name}\n       ${error.message}`)
    process.exitCode = 1
  }
}

test("bbox of points", () => assert.deepEqual(bbox([[10, 20], [30, 5], [25, 40]]), { x: 10, y: 5, w: 20, h: 35 }))

test("translatePoints moves a drawing but keeps all of it inside the sheet", () => {
  assert.deepEqual(translatePoints([[10, 10], [20, 30]], 5, -3), [[15, 7], [25, 27]])
  assert.deepEqual(translatePoints([[10, 10], [20, 30]], 500, 500), [[90, 80], [100, 100]]) // stops at the edge
  assert.deepEqual(translatePoints([[10, 10], [20, 30]], -500, -500), [[0, 0], [10, 20]])
})

test("simplify keeps corners and removes points on a straight line", () => {
  const line = Array.from({ length: 50 }, (_, i) => [i, 10])
  assert.equal(simplify(line, 1, 1000, 1000).length, 2)
  const corner = [...Array.from({ length: 20 }, (_, i) => [i, 10]), ...Array.from({ length: 20 }, (_, i) => [20, 10 + i])]
  const simple = simplify(corner, 1, 1000, 1000)
  assert.ok(simple.length >= 3 && simple.length <= 5, `corner kept, got ${simple.length}`)
  assert.deepEqual(simple[0], [0, 10])
  assert.deepEqual(simple[simple.length - 1], [20, 29])
})

test("simplify never drops the endpoints and handles tiny input", () => {
  assert.deepEqual(simplify([[1, 1]], 5, 100, 100), [[1, 1]])
  assert.deepEqual(simplify([[1, 1], [2, 2]], 5, 100, 100), [[1, 1], [2, 2]])
  const noisy = Array.from({ length: 300 }, (_, i) => [i / 3, 50 + Math.sin(i) * 0.05])
  const out = simplify(noisy, 2, 1600, 1000)
  assert.deepEqual(out[0], noisy[0])
  assert.deepEqual(out[out.length - 1], noisy[noisy.length - 1])
  assert.ok(out.length < 10)
})

test("limitPoints thins evenly and keeps first and last", () => {
  const many = Array.from({ length: 1000 }, (_, i) => [i / 10, 0])
  const out = limitPoints(many, 100)
  assert.equal(out.length, 100)
  assert.deepEqual(out[0], many[0])
  assert.deepEqual(out[99], many[999])
  assert.equal(limitPoints([[1, 1], [2, 2]], 100).length, 2)
})

test("polyline length uses real pixel proportions (the sheet is not square)", () => {
  // 10% of a 2000 px wide sheet = 200 px; 10% of a 1000 px high sheet = 100 px.
  assert.equal(polylineLengthPx([[0, 0], [10, 0]], 2000, 1000), 200)
  assert.equal(polylineLengthPx([[0, 0], [0, 10]], 2000, 1000), 100)
  assert.equal(Math.round(polylineLengthPx([[0, 0], [10, 0], [10, 10]], 2000, 1000)), 300)
  assert.equal(Math.round(polylineLengthPx([[0, 0], [10, 0], [10, 10]], 2000, 1000, true)), 300 + 224) // closing diagonal
})

test("polygon area (shoelace) for a rectangle and a triangle, in either winding", () => {
  assert.equal(polygonAreaPx([[0, 0], [10, 0], [10, 10], [0, 10]], 2000, 1000), 200 * 100)
  assert.equal(polygonAreaPx([[0, 10], [10, 10], [10, 0], [0, 0]], 2000, 1000), 200 * 100)
  assert.equal(polygonAreaPx([[0, 0], [10, 0], [0, 10]], 2000, 1000), (200 * 100) / 2)
})

test("meters and square meters need a calibrated sheet; area scales with the square of the length", () => {
  assert.equal(lengthMeters(500, 1000, null), null)
  assert.equal(areaSquareMeters(500, 1000, null), null)
  assert.equal(lengthMeters(500, 1000, 40), 20)
  // sheet 1000 px = 40 m, so 1 px = 0.04 m; a 100x100 px square = 4 m x 4 m = 16 m2
  assert.ok(Math.abs(areaSquareMeters(100 * 100, 1000, 40) - 16) < 1e-9)
})

test("formatArea picks a readable unit", () => {
  assert.equal(formatArea(16), "16.0 m²")
  assert.equal(formatArea(250), "250 m²")
  assert.equal(formatArea(25000), "2.50 ha")
  assert.equal(formatArea(0.5), "5000 cm²")
})

test("pointsToPath builds an SVG path in sheet pixels, optionally closed", () => {
  assert.equal(pointsToPath([[0, 0], [50, 50]], 200, 100), "M0.0 0.0 L100.0 50.0")
  assert.equal(pointsToPath([[0, 0], [50, 50], [0, 50]], 200, 100, true), "M0.0 0.0 L100.0 50.0 L0.0 50.0 Z")
})

test("asPoints accepts jsonb numbers and drops anything that is not a pair", () => {
  assert.deepEqual(asPoints([[1, 2], ["3", "4"], [5], "x", null, [1, "a"]]), [[1, 2], [3, 4]])
  assert.deepEqual(asPoints(null), [])
  assert.deepEqual(asPoints({ a: 1 }), [])
})

// ---- Layers (must match move_annotation_layer in 0017) ----
const ids = ["a", "b", "c", "d", "e"]
test("front / back / forward / backward", () => {
  assert.deepEqual(reorderIds(ids, "b", "front"), ["a", "c", "d", "e", "b"])
  assert.deepEqual(reorderIds(ids, "d", "back"), ["d", "a", "b", "c", "e"])
  assert.deepEqual(reorderIds(ids, "b", "forward"), ["a", "c", "b", "d", "e"])
  assert.deepEqual(reorderIds(ids, "d", "backward"), ["a", "b", "d", "c", "e"])
})

test("layer moves at the edges change nothing", () => {
  assert.deepEqual(reorderIds(ids, "e", "front"), ids)
  assert.deepEqual(reorderIds(ids, "e", "forward"), ids)
  assert.deepEqual(reorderIds(ids, "a", "back"), ids)
  assert.deepEqual(reorderIds(ids, "a", "backward"), ids)
  assert.deepEqual(reorderIds(ids, "zzz", "front"), ids)
  assert.equal(canMoveLayer(ids, "e", "front"), false)
  assert.equal(canMoveLayer(ids, "a", "backward"), false)
  assert.equal(canMoveLayer(ids, "c", "front"), true)
  assert.equal(canMoveLayer(ids, "c", "back"), true)
})

test("a single-item sheet cannot move", () => {
  assert.deepEqual(reorderIds(["x"], "x", "front"), ["x"])
  assert.equal(canMoveLayer(["x"], "x", "front"), false)
  assert.equal(canMoveLayer(["x"], "x", "back"), false)
})

test("layerChanges returns only the renumbered items and a dense 0..n-1 order, even from messy input", () => {
  const items = [{ id: "a", z_index: 0 }, { id: "b", z_index: 1 }, { id: "c", z_index: 2 }]
  assert.deepEqual(layerChanges(items, "a", "front"), [{ id: "b", z_index: 0 }, { id: "c", z_index: 1 }, { id: "a", z_index: 2 }])
  assert.deepEqual(layerChanges(items, "c", "front"), [])
  const messy = [{ id: "a", z_index: 7 }, { id: "b", z_index: 3 }, { id: "c", z_index: 3, created_at: "2026-01-02" }, { id: "d", z_index: 3, created_at: "2026-01-01" }]
  assert.deepEqual(sortByLayer(messy).map((item) => item.id), ["b", "d", "c", "a"]) // same z: older first, then by id
  const result = layerChanges(messy, "a", "back")
  assert.deepEqual(result, [{ id: "a", z_index: 0 }, { id: "b", z_index: 1 }, { id: "d", z_index: 2 }]) // c already sits at 3
})

// ---- Arranging ----
const ctx = { width: 2000, height: 1000 }
const rect = (id, x, y, w, h) => ({ id, kind: "shape", x, y, w, h, points: null })
const pointsItem = (id, points, kind = "draw") => ({ id, kind, x: Math.min(...points.map((p) => p[0])), y: Math.min(...points.map((p) => p[1])), w: null, h: null, points })

test("itemBox for shapes, drawings, symbols (square in pixels) and text", () => {
  assert.deepEqual(itemBox(rect("a", 10, 20, 30, 15), ctx), { x: 10, y: 20, w: 30, h: 15 })
  assert.deepEqual(itemBox(pointsItem("b", [[10, 10], [30, 50]]), ctx), { x: 10, y: 10, w: 20, h: 40 })
  const symbol = itemBox({ id: "s", kind: "symbol", x: 5, y: 5, w: 4, h: null, points: null }, ctx)
  assert.equal(symbol.w, 4)
  assert.equal(symbol.h, 8) // 4 % of 2000 px = 80 px = 8 % of 1000 px
  const text = itemBox({ id: "t", kind: "text", x: 5, y: 5, w: 20, h: null, points: null, text: "hello", font_size: 1.6 }, ctx)
  assert.equal(text.w, 20)
  assert.ok(text.h > 0 && text.h < 10)
})

test("align left / right / center / top / bottom / middle lines items up with the selection", () => {
  const items = [rect("a", 10, 10, 10, 10), rect("b", 40, 30, 20, 10), rect("c", 70, 50, 10, 20)]
  const x = (moves, id) => moves.find((m) => m.id === id).x
  const y = (moves, id) => moves.find((m) => m.id === id).y
  assert.deepEqual(alignMoves(items, "left", ctx).map((m) => m.x), [10, 10, 10])
  assert.deepEqual(alignMoves(items, "right", ctx).map((m) => m.x + items.find((i) => i.id === m.id).w), [80, 80, 80])
  assert.equal(x(alignMoves(items, "center", ctx), "b"), 35) // centre of selection = 45, b is 20 wide
  assert.deepEqual(alignMoves(items, "top", ctx).map((m) => m.y), [10, 10, 10])
  assert.deepEqual(alignMoves(items, "bottom", ctx).map((m) => m.y + items.find((i) => i.id === m.id).h), [70, 70, 70])
  assert.equal(y(alignMoves(items, "middle", ctx), "a"), 35) // centre of selection = 40, a is 10 high
  assert.deepEqual(alignMoves([items[0]], "left", ctx), [])
})

test("align moves a drawing by translating all its points", () => {
  const items = [rect("a", 10, 10, 10, 10), pointsItem("b", [[40, 30], [50, 35]])]
  const move = alignMoves(items, "left", ctx).find((m) => m.id === "b")
  assert.deepEqual(move.points, [[10, 30], [20, 35]])
})

test("distribute spaces three or more items evenly and keeps the outer two", () => {
  const items = [rect("a", 0, 0, 10, 10), rect("b", 20, 0, 10, 10), rect("c", 90, 0, 10, 10)]
  const moves = distributeMoves(items, "horizontal", ctx)
  assert.deepEqual(moves.map((m) => [m.id, m.x]), [["a", 0], ["b", 45], ["c", 90]])
  assert.deepEqual(distributeMoves(items.slice(0, 2), "horizontal", ctx), [])
  const vertical = distributeMoves([rect("a", 0, 0, 10, 10), rect("b", 0, 5, 10, 10), rect("c", 0, 90, 10, 10)], "vertical", ctx)
  assert.deepEqual(vertical.map((m) => m.y), [0, 45, 90])
})

test("shifted and shiftedTogether stay inside the sheet and keep relative positions", () => {
  const a = rect("a", 80, 10, 15, 10)
  assert.equal(shifted(a, 50, 0, ctx).x, 85) // stops at the right edge
  assert.equal(shifted(a, -500, -500, ctx).x, 0)
  const items = [rect("a", 10, 10, 10, 10), rect("b", 80, 10, 15, 10)]
  const moved = shiftedTogether(items, 30, 0, ctx)
  assert.deepEqual(moved.map((m) => m.x), [15, 85]) // the block stops when b hits the edge, a follows by the same amount
})

test("isNoop recognises moves that change nothing", () => {
  const items = [rect("a", 10, 10, 10, 10), pointsItem("b", [[1, 1], [2, 2]])]
  assert.equal(isNoop(items, [{ id: "a", x: 10, y: 10 }, { id: "b", points: [[1, 1], [2, 2]] }]), true)
  assert.equal(isNoop(items, [{ id: "a", x: 11, y: 10 }]), false)
  assert.equal(isNoop(items, [{ id: "b", points: [[1, 1], [2, 3]] }]), false)
})

test("inRectangle: touch mode catches partly covered items, contain mode only fully covered ones", () => {
  const items = [rect("a", 10, 10, 10, 10), rect("b", 18, 10, 10, 10), rect("c", 60, 60, 5, 5), pointsItem("line", [[0, 15], [100, 15]])]
  const box = { x: 5, y: 5, w: 15, h: 15 }
  assert.deepEqual(inRectangle(items, box, ctx, "touch").sort(), ["a", "b", "line"])
  assert.deepEqual(inRectangle(items, box, ctx, "contain"), ["a"])
})

test("withGroupMembers pulls in every member of a touched group", () => {
  const all = [{ id: "a", group_id: "g1" }, { id: "b", group_id: "g1" }, { id: "c", group_id: null }, { id: "d", group_id: "g2" }]
  assert.deepEqual(withGroupMembers(all, ["a"]).sort(), ["a", "b"])
  assert.deepEqual(withGroupMembers(all, ["c"]), ["c"])
  assert.deepEqual(withGroupMembers(all, ["a", "d"]).sort(), ["a", "b", "d"])
})

// ---- Lines, arrows, clouds ----
test("constrainAngle snaps a segment to 15 degree steps and keeps its length", () => {
  const end = constrainAngle([10, 10], [60, 12], 1000, 1000, 15) // almost horizontal
  assert.ok(Math.abs(end[1] - 10) < 0.01, `expected a horizontal line, got y=${end[1]}`)
  assert.ok(Math.abs(end[0] - 10 - Math.hypot(50, 2)) < 0.05)
  const diagonal = constrainAngle([10, 10], [50, 52], 1000, 1000, 45)
  assert.ok(Math.abs(diagonal[0] - 10 - (diagonal[1] - 10)) < 0.01, "45 degree diagonal")
  assert.deepEqual(constrainAngle([5, 5], [5, 5], 1000, 1000), [5, 5])
})

test("arrowHeadPx puts the tip on the end point and symmetric wings behind it", () => {
  const [left, tip, right] = arrowHeadPx([0, 50], [50, 50], 1000, 1000, 20)
  assert.deepEqual(tip, [500, 500])
  assert.ok(left[0] < 500 && right[0] < 500)
  assert.ok(Math.abs(left[1] - 500) > 1)
  assert.ok(Math.abs(Math.abs(left[1] - 500) - Math.abs(right[1] - 500)) < 1e-9)
  assert.ok(Math.abs(Math.hypot(left[0] - 500, left[1] - 500) - 20) < 1e-9)
})

test("dimensionTickPx is perpendicular to the line and centred on its end", () => {
  const [a, b] = dimensionTickPx([10, 50], [60, 50], "a", 1000, 1000, 10)
  assert.deepEqual([Math.round(a[0]), Math.round(b[0])], [100, 100]) // same x: vertical tick on a horizontal line
  assert.equal(Math.round(Math.abs(a[1] - b[1])), 20)
  assert.equal(Math.round((a[1] + b[1]) / 2), 500)
})

test("cloudPath makes outward arcs along every edge and closes", () => {
  const d = cloudPath([[10, 10], [50, 10], [50, 40], [10, 40]], 1000, 1000, 40)
  assert.ok(d.startsWith("M100.0 100.0"))
  assert.ok(d.endsWith("Z"))
  assert.equal((d.match(/A/g) ?? []).length, 10 + 8 + 10 + 8) // 400 px edges / 40 and 300 px edges / 40 (rounded)
  assert.equal(cloudPath([[1, 1], [2, 2]], 100, 100, 10), "")
  // reversing the drawing direction flips the sweep so the bumps still point outward
  const reversed = cloudPath([[10, 40], [50, 40], [50, 10], [10, 10]], 1000, 1000, 40)
  assert.notEqual(d.match(/ 0 0 (\d) /)[1], reversed.match(/ 0 0 (\d) /)[1])
})

test("rectCorners orders the four corners whatever the drag direction", () => {
  assert.deepEqual(rectCorners([50, 60], [10, 20]), [[10, 20], [50, 20], [50, 60], [10, 60]])
})

test("symbol library: unique keys, every symbol has paths, all keys match the database list", () => {
  const dbKeys = ["north_arrow", "hazard", "inspect", "check", "cross", "equipment", "crane", "exit", "fire_ext", "first_aid", "ppe", "no_entry"]
  assert.deepEqual(symbolLibrary.map((s) => s.key).sort(), [...dbKeys].sort())
  assert.equal(new Set(symbolLibrary.map((s) => s.key)).size, symbolLibrary.length)
  assert.ok(symbolLibrary.every((s) => s.paths.length > 0 && s.paths.every((p) => /^M/.test(p.d))))
  assert.equal(symbolByKey.hazard.label, "Hazard")
  assert.ok(symbolLibrary.every((s) => symbolGroups.includes(s.group)))
})

test("buildPdf writes a valid single-page PDF: header, exact xref offsets, image length, page size", () => {
  const jpeg = new Uint8Array(1000).map((_, i) => (i * 7) % 256)
  const pdf = buildPdf(jpeg, 1600, 900, "Ground floor (Rev 2) é")
  const text = Buffer.from(pdf).toString("latin1")
  assert.ok(text.startsWith("%PDF-1.4"))
  assert.ok(text.trimEnd().endsWith("%%EOF"))
  const start = Number(text.match(/startxref\n(\d+)\n/)[1])
  assert.equal(text.slice(start, start + 4), "xref")
  const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]))
  assert.equal(entries.length, 6)
  entries.forEach((offset, i) => assert.equal(text.slice(offset, offset + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1} offset`))
  assert.ok(text.includes("/Width 1600 /Height 900"))
  assert.ok(text.includes("/Length 1000 >>"))
  assert.ok(text.includes("/MediaBox [0 0 1200 675]")) // 96 dpi -> points
  const imageStart = text.indexOf("stream\n", text.indexOf("/DCTDecode")) + "stream\n".length
  assert.deepEqual([...pdf.slice(imageStart, imageStart + 1000)], [...jpeg]) // image bytes stored untouched
  assert.ok(text.includes("(Ground floor \\(Rev 2\\) ?)")) // title is escaped and ASCII only
})

test("rotation: angles normalise, the handle straight above is 0, snapping and local axes", () => {
  assert.equal(normalizeAngle(190), -170)
  assert.equal(normalizeAngle(-190), 170)
  assert.equal(normalizeAngle(360), 0)
  assert.equal(normalizeAngle(725), 5)
  assert.equal(angleFromCenter(100, 100, 100, 40), 0) // pointer straight above the centre
  assert.equal(angleFromCenter(100, 100, 160, 100), 90) // to the right = rotated a quarter turn clockwise
  assert.equal(Math.abs(angleFromCenter(100, 100, 100, 160)), 180)
  assert.equal(snapAngle(52, 15), 45)
  assert.equal(snapAngle(-97, 15), -90)
  const same = toLocalAxes(10, 5, 0)
  assert.deepEqual([same.x, same.y], [10, 5])
  const quarter = toLocalAxes(10, 0, 90) // an item turned 90 degrees clockwise: moving right on screen is "up" in its own axes
  assert.ok(Math.abs(quarter.x) < 1e-9 && Math.abs(quarter.y + 10) < 1e-9)
})

test("fitImageBox keeps the picture's proportions on a non-square sheet, centres it and keeps it on the sheet", () => {
  const sheet = { width: 2000, height: 1000 }
  const box = fitImageBox({ width: 800, height: 600 }, sheet, 20) // 4:3 picture, 20 % of the sheet width = 400 px wide, 300 px high = 30 % of the height
  assert.deepEqual([box.w, box.h], [20, 30])
  assert.deepEqual([box.x, box.y], [40, 35])
  const corner = fitImageBox({ width: 800, height: 600 }, sheet, 20, 2, 2)
  assert.deepEqual([corner.x, corner.y], [0, 0])
  const tall = fitImageBox({ width: 100, height: 1000 }, sheet, 30) // very tall picture is limited to 90 % of the height
  assert.equal(tall.h, 90)
  assert.ok(tall.w < 30 && Math.abs((tall.w / 100) * 2000 / ((tall.h / 100) * 1000) - 0.1) < 0.01)
})

test("resizedBox: locked aspect keeps the shape and stays on the sheet, free resize changes each side, never below 1 %", () => {
  const box = { x: 10, y: 10, w: 20, h: 10 }
  assert.deepEqual(resizedBox(box, 10, 0, true), { w: 30, h: 15 })
  assert.deepEqual(resizedBox(box, 10, 50, false), { w: 30, h: 60 })
  assert.deepEqual(resizedBox(box, 500, 0, true), { w: 90, h: 45 }) // limited by the right edge
  const low = resizedBox(box, -500, -500, false)
  assert.deepEqual(low, { w: 1, h: 1 })
  const lowLocked = resizedBox(box, -500, 0, true)
  assert.equal(lowLocked.w, 1)
  assert.equal(lowLocked.h, 0.5)
  const tallBox = { x: 10, y: 60, w: 10, h: 30 } // 30 % high starting at 60: only 40 % of room, so width is limited too
  assert.deepEqual(resizedBox(tallBox, 50, 0, true), { w: 13.333, h: 40 })
})

test("overdue / due soon use calendar dates and ignore verified pins and notes", () => {
  const open = { status: "in_progress", category: "progress" }
  assert.equal(isOverdue({ ...open, due_date: "2026-10-10" }, "2026-10-11"), true)
  assert.equal(isOverdue({ ...open, due_date: "2026-10-11" }, "2026-10-11"), false) // due today is not late yet
  assert.equal(isOverdue({ ...open, status: "verified", due_date: "2026-10-01" }, "2026-10-11"), false)
  assert.equal(isOverdue({ ...open, category: "note", due_date: "2026-10-01" }, "2026-10-11"), false)
  assert.equal(isOverdue({ ...open, due_date: null }, "2026-10-11"), false)
  assert.equal(isDueSoon({ ...open, due_date: "2026-10-13" }, "2026-10-11"), true)
  assert.equal(isDueSoon({ ...open, due_date: "2026-10-15" }, "2026-10-11"), false)
  assert.equal(daysBetween("2026-02-27", "2026-03-02"), 3)
})

test("summarize counts work pins only and rounds the verified share", () => {
  const pins = [
    { status: "verified", category: "progress", due_date: null },
    { status: "verified", category: "quality", due_date: "2026-01-01" },
    { status: "for_review", category: "progress", due_date: "2026-10-01" },
    { status: "issue", category: "safety", due_date: null },
    { status: "not_started", category: "progress", due_date: null },
    { status: "not_started", category: "note", due_date: null },
  ]
  const totals = summarize(pins, "2026-10-11")
  assert.equal(totals.total, 5)
  assert.equal(totals.verified, 2)
  assert.equal(totals.percentVerified, 40)
  assert.equal(totals.overdue, 1)
  assert.equal(summarize([], "2026-10-11").percentVerified, 0)
})

test("byZone groups pins per sheet and puts the most behind first", () => {
  const sheets = [{ id: "a", title: "L1", level: "1", discipline: null }, { id: "b", title: "L2", level: "2", discipline: null }]
  const pins = [
    { blueprint_id: "a", status: "verified", category: "progress", due_date: null },
    { blueprint_id: "b", status: "issue", category: "progress", due_date: null },
  ]
  const rows = byZone(sheets, pins, "2026-10-11")
  assert.deepEqual(rows.map((row) => row.blueprintId), ["b", "a"])
  assert.equal(rows[1].totals.percentVerified, 100)
})

test("scheduleElapsed is a clamped share of the project duration", () => {
  assert.equal(scheduleElapsed("2026-01-01", "2026-01-11", "2026-01-06"), 50)
  assert.equal(scheduleElapsed("2026-01-01", "2026-01-11", "2025-12-01"), 0)
  assert.equal(scheduleElapsed("2026-01-01", "2026-01-11", "2027-01-01"), 100)
  assert.equal(scheduleElapsed(null, "2026-01-11", "2026-01-06"), null)
})

test("CSV quotes separators and neutralises spreadsheet formulas", () => {
  assert.equal(csvEscape('a,"b"'), '"a,""b"""')
  assert.equal(csvEscape("=SUM(A1)"), "'=SUM(A1)")
  assert.equal(csvEscape(null), "")
  assert.equal(toCsv(["x", "y"], [[1, "two, three"]]), 'x,y\r\n1,"two, three"')
})

test("projectHealth: risk for critical issues, many late pins or far behind; watch for small problems", () => {
  const base = { total: 10, verified: 5, percentVerified: 50, overdue: 0, issue: 0 }
  assert.equal(projectHealth(base, 50, 0), "good")
  assert.equal(projectHealth(base, null, 0), "good")
  assert.equal(projectHealth({ ...base, overdue: 1 }, 50, 0), "watch")
  assert.equal(projectHealth({ ...base, issue: 1 }, 50, 0), "watch")
  assert.equal(projectHealth(base, 60, 0), "watch") // 10 points behind
  assert.equal(projectHealth(base, 70, 0), "risk") // 20 points behind
  assert.equal(projectHealth({ ...base, overdue: 5 }, 50, 0), "risk")
  assert.equal(projectHealth({ ...base, issue: 1 }, 50, 1), "risk")
  assert.equal(projectHealth({ ...base, total: 0 }, 50, 0), "empty")
})

test("print reports escape every value and keep the structure", () => {
  assert.equal(escapeHtml(`<b onclick="x">&'</b>`), "&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;")
  const html = reportHtml({ title: "Daily <report>", subtitle: "Site", meta: [["Who", "<script>alert(1)</script>"]], sections: [{ heading: "Work", body: "line 1\nline 2" }, { heading: "T", table: { head: ["A"], rows: [["<i>"]] } }] })
  assert.ok(!html.includes("<script>alert"))
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"))
  assert.ok(html.includes("line 1<br>line 2"))
  assert.ok(html.includes("<td>&lt;i&gt;</td>"))
})

test("reportableDates lists today and the 13 days before, newest first", () => {
  const dates = reportableDates("2026-03-02")
  assert.equal(dates.length, 14)
  assert.equal(dates[0], "2026-03-02")
  assert.equal(dates[1], "2026-03-01")
  assert.equal(dates[2], "2026-02-28")
  assert.equal(dates[13], "2026-02-17")
})

test("resizeFromCorner keeps the opposite corner fixed (also when rotated), keeps the ratio when asked and stays on the sheet", () => {
  const sheet = { width: 2000, height: 1000 }
  const box = { x: 10, y: 10, w: 20, h: 10 }
  assert.deepEqual(resizeFromCorner(box, "se", 100, 0, 0, sheet, false), { x: 10, y: 10, w: 25, h: 10 })
  assert.deepEqual(resizeFromCorner(box, "nw", -100, -50, 0, sheet, false), { x: 5, y: 5, w: 25, h: 15 }) // right and bottom edges stay put
  assert.deepEqual(resizeFromCorner(box, "ne", 100, -50, 0, sheet, false), { x: 10, y: 5, w: 25, h: 15 })
  assert.deepEqual(resizeFromCorner(box, "sw", -100, 50, 0, sheet, false), { x: 5, y: 10, w: 25, h: 15 })
  const locked = resizeFromCorner(box, "se", 200, 999, 0, sheet, true) // ratio 2:1 wins over the vertical movement
  assert.equal(locked.w / 100 * 2000 / (locked.h / 100 * 1000), 4) // 400 x 100 px keeps its 4:1 shape
  const square = { x: 40, y: 40, w: 10, h: 10 }
  assert.deepEqual(resizeFromCorner(square, "se", 100, 0, 90, { width: 1000, height: 1000 }, false), { x: 35, y: 45, w: 20, h: 10 }) // turned a quarter: the top-left corner on screen does not move
  assert.deepEqual(resizeFromCorner({ x: 90, y: 10, w: 10, h: 10 }, "se", 500, 500, 0, { width: 1000, height: 1000 }, false), { x: 90, y: 10, w: 10, h: 10 }) // already at the edge
  const tiny = resizeFromCorner(box, "se", -9999, -9999, 0, sheet, false)
  assert.deepEqual([tiny.w, tiny.h], [1, 1])
})

test("zip writer: known CRC, readable structure, UTF-8 names, safe names, duplicates refused", () => {
  assert.equal(crc32(textBytes("123456789")), 0xcbf43926)
  assert.equal(safeEntryName("../../etc/passwd"), "etc/passwd")
  assert.equal(safeEntryName("files\\a:b/c?.png"), "files/a_b/c_.png")
  const zip = buildZip([
    { name: "README.txt", data: textBytes("hello") },
    { name: "data/pins.json", data: textBytes('{"é":1}') },
    { name: "empty.bin", data: new Uint8Array(0) },
  ])
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.length - 22
  assert.equal(view.getUint32(eocd, true), 0x06054b50)
  assert.equal(view.getUint16(eocd + 10, true), 3) // three entries
  let at = view.getUint32(eocd + 16, true)
  const seen = []
  for (let index = 0; index < 3; index += 1) {
    assert.equal(view.getUint32(at, true), 0x02014b50)
    const nameLength = view.getUint16(at + 28, true)
    const size = view.getUint32(at + 24, true)
    const crc = view.getUint32(at + 16, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))
    assert.equal(view.getUint32(local, true), 0x04034b50)
    const dataAt = local + 30 + view.getUint16(local + 26, true)
    assert.equal(crc32(zip.subarray(dataAt, dataAt + size)), crc) // the stored bytes match their checksum
    seen.push([name, size])
    at += 46 + nameLength
  }
  assert.deepEqual(seen, [["README.txt", 5], ["data/pins.json", 8], ["empty.bin", 0]])
  assert.throws(() => buildZip([{ name: "a.txt", data: textBytes("1") }, { name: "./a.txt", data: textBytes("2") }]), /Duplicate/)
  assert.throws(() => buildZip([{ name: "../", data: textBytes("1") }]), /usable name/)
})

test("parseSettings reads the stored values and falls back to defaults for anything missing or malformed", () => {
  assert.deepEqual(parseSettings([]), defaultSettings)
  const parsed = parseSettings([
    { key: "qa.acceptance_threshold", value: 85 },
    { key: "qa.weights", value: { critical: 6, major: 3, minor: 1 } },
    { key: "work.hours", value: { start: "06:30", end: "16:30", days: [5, 1, 3] } },
    { key: "standards", value: [{ code: "NSCP", title: "Structural" }, { nope: true }] },
    { key: "access.inactive_days", value: 45 },
  ])
  assert.equal(parsed.threshold, 85)
  assert.equal(parsed.weights.critical, 6)
  assert.deepEqual(parsed.hours, { start: "06:30", end: "16:30", days: [1, 3, 5] })
  assert.deepEqual(parsed.standards, [{ code: "NSCP", title: "Structural" }])
  assert.equal(parsed.inactiveDays, 45)
  const bad = parseSettings([{ key: "qa.acceptance_threshold", value: "high" }, { key: "qa.weights", value: { critical: 1 } }, { key: "work.hours", value: { start: 7, end: 9, days: [] } }, { key: "access.inactive_days", value: 2 }])
  assert.deepEqual(bad, defaultSettings)
})

test("offline queue rules: only a lost connection is retried, oldest work goes first, back-off is capped", () => {
  assert.equal(isNetworkProblem(new TypeError("Failed to fetch")), true)
  assert.equal(isNetworkProblem({ message: "TypeError: NetworkError when attempting to fetch resource." }), true)
  assert.equal(isNetworkProblem("Load failed"), true)
  assert.equal(isNetworkProblem({ message: "new row violates row-level security policy", code: "42501" }), false)
  assert.equal(isNetworkProblem({ message: "A verified pin can only be changed by an Engineer", code: "P0001" }), false)
  assert.equal(isNetworkProblem({ message: "Failed to fetch", code: "PGRST000" }), true)
  assert.equal(isNetworkProblem(null), false)
  assert.equal(verdictFor(null, 1), "sent")
  assert.equal(verdictFor(new TypeError("Failed to fetch"), 1), "retry")
  assert.equal(verdictFor(new TypeError("Failed to fetch"), MAX_ATTEMPTS), "failed")
  assert.equal(verdictFor({ message: "permission denied", code: "42501" }, 1), "failed")
  const item = (id, createdAt, status = "pending") => ({ id, userId: "u", kind: "pin_photo", label: id, payload: {}, createdAt, attempts: 0, status })
  assert.deepEqual(sendOrder([item("b", 20), item("x", 5, "failed"), item("a", 10)]).map((entry) => entry.id), ["a", "b"])
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(backoffSeconds), [15, 30, 60, 120, 240, 480, 600, 600, 600])
  assert.deepEqual(summarizeQueue([item("a", 1), item("b", 2, "failed")]), { pending: 1, failed: 1, total: 2 })
})

test("pin QR codes: valid size, finder squares in three corners, quiet zone, link carries project and pin", () => {
  const link = pinLink("https://buildtrack.example/", "p-1", "pin 2")
  assert.equal(link, "https://buildtrack.example/pin?project=p-1&pin=pin%202")
  const matrix = qrMatrix(link)
  const size = matrix.length
  assert.ok(size >= 21 && (size - 17) % 4 === 0, "size " + size + " is not a QR version size")
  const finder = (top, left) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        assert.equal(matrix[top + r][left + c], edge || core, `finder at ${top},${left} cell ${r},${c}`)
      }
    }
  }
  finder(0, 0)
  finder(0, size - 7)
  finder(size - 7, 0)
  assert.equal(matrix[size - 8][8], true) // the fixed dark module
  assert.deepEqual(qrMatrix(link), matrix) // same text, same code
  const svg = qrSvg(link, { margin: 4, modulePx: 2 })
  assert.ok(svg.startsWith("<svg") && svg.includes(`viewBox="0 0 ${size + 8} ${size + 8}"`) && svg.includes("<path d="))
  assert.ok(qrMatrix("x".repeat(200), "L").length > size)
})

test("text format: defaults per kind, sanitising, merging, case and list display", () => {
  assert.equal(resolveFormat("text", {}).bold, true) // text boxes have always been bold
  assert.equal(resolveFormat("note", {}).bold, false)
  assert.equal(resolveFormat("note", { bold: true, family: "Poppins" }).family, "Poppins")
  assert.deepEqual(sanitizeFormat({ bold: true, colour: "red", family: "Comic Sans", align: "middle", line_height: 9, letter_spacing: 0.1 }), { bold: true, letter_spacing: 0.1 })
  assert.deepEqual(sanitizeFormat(null), {})
  assert.deepEqual(sanitizeFormat([1]), {})
  assert.deepEqual(mergeFormat({ bold: true, align: "center" }, { align: undefined, italic: true }), { bold: true, italic: true })
  assert.equal(transformText("hello WORLD-wide", "capitalize"), "Hello World-Wide")
  assert.equal(transformText("MiXed", "uppercase"), "MIXED")
  const f = resolveFormat("note", { list: "number" })
  assert.deepEqual(displayLines("one\n\ntwo", f), ["1. one", "", "2. two"])
  assert.deepEqual(displayLines("a\nb", resolveFormat("note", { list: "bullet", transform: "uppercase" })), ["• A", "• B"])
  assert.equal(decorations(resolveFormat("text", { underline: true, strike: true })), "underline line-through")
  assert.equal(decorations(resolveFormat("text", {})), "none")
  assert.equal(sizeToLabel(1.6), 16)
  assert.equal(labelToSize(30.8), 3.08)
  assert.equal(labelToSize(500), 12)
  assert.equal(canFormat("text") && canFormat("note"), true)
  assert.equal(canFormat("shape"), false)
})

test("capsule placement: centred above the box, clamped to the stage, below when there is no room", () => {
  const view = { scale: 0.5, tx: 100, ty: 50 }
  const stage = { width: 1000, height: 700 }
  const capsule = { width: 200, height: 40 }
  const above = capsulePlacement({ x: 800, y: 800, w: 400, h: 200 }, view, stage, capsule) // box on screen: x 500..700, y 450..550
  assert.deepEqual(above, { left: 600, top: 398, below: false }) // 450 - 12 - 40
  const nearEdge = capsulePlacement({ x: 1700, y: 800, w: 100, h: 100 }, view, stage, capsule)
  assert.equal(nearEdge.left, 892) // stays 8 px inside the right edge (1000 - 100 - 8)
  const top = capsulePlacement({ x: 100, y: 0, w: 100, h: 100 }, view, stage, capsule) // screen y 50: no room above
  assert.equal(top.below, true)
  assert.equal(top.top, 50 + 50 + 12) // under the box
  const lifted = capsulePlacement({ x: 800, y: 800, w: 0, h: 0 }, view, stage, capsule, { lift: 80 })
  assert.equal(lifted.top, 450 - 80 - 12 - 40)
  const turned = rotatedBounds({ x: 0, y: 0, w: 100, h: 20 }, 90) // a quarter turn swaps width and height around the centre
  assert.ok(Math.abs(turned.w - 20) < 1e-9 && Math.abs(turned.h - 100) < 1e-9 && Math.abs(turned.x - 40) < 1e-9 && Math.abs(turned.y + 40) < 1e-9)
  assert.deepEqual(rotatedBounds({ x: 1, y: 2, w: 3, h: 4 }, 0), { x: 1, y: 2, w: 3, h: 4 })
})

// ---------------------------------------------------------------- QA model (mirrors complete_inspection / save_inspection_item)
const W = { critical: 5, major: 3, minor: 1 }
const it = (severity, result, hold_point = false) => ({ severity, result, hold_point })
test("QA score: weighted share of judged items, N/A left out, pending blocks the verdict", () => {
  assert.equal(previewScore([], W, 90).score, null)
  assert.equal(previewScore([it("critical", "na")], W, 90).result, null)
  const half = previewScore([it("major", "pass"), it("major", "pending")], W, 90)
  assert.equal(half.score, 100)
  assert.equal(half.result, null)
  assert.equal(half.pending, 1)
  const all = previewScore([it("critical", "pass"), it("major", "pass"), it("minor", "pass"), it("minor", "na")], W, 90)
  assert.deepEqual([all.score, all.result, all.na], [100, "passed", 1])
})
test("QA result: conditional above the pass mark, failed on a critical or hold-point fail or below the mark", () => {
  assert.equal(previewScore([it("critical", "pass"), it("major", "pass"), it("minor", "fail")], W, 85).result, "conditional")
  assert.equal(previewScore([it("critical", "pass"), it("major", "pass"), it("minor", "fail")], W, 85).score, 88.89)
  assert.equal(previewScore([it("critical", "pass"), it("major", "pass"), it("minor", "fail")], W, 90).result, "failed") // 88.89 < 90
  assert.equal(previewScore([it("critical", "fail"), ...Array.from({ length: 30 }, () => it("minor", "pass"))], W, 50).result, "failed") // critical always fails
  assert.equal(previewScore([it("minor", "fail", true), ...Array.from({ length: 30 }, () => it("minor", "pass"))], W, 50).result, "failed") // hold point
  assert.equal(previewScore([it("major", "fail"), it("critical", "pass"), it("minor", "pass")], W, 90).score, 66.67)
})
test("QA measurement: outside min / max fails, inside passes, no tolerance means the engineer decides", () => {
  const m = { kind: "measure", min_value: 40, max_value: 60 }
  assert.equal(measureVerdict(m, 39.9), "fail")
  assert.equal(measureVerdict(m, 40), "pass")
  assert.equal(measureVerdict(m, 60), "pass")
  assert.equal(measureVerdict(m, 60.1), "fail")
  assert.equal(measureVerdict({ kind: "measure", min_value: 25, max_value: null }, 30), "pass")
  assert.equal(measureVerdict({ kind: "measure", min_value: null, max_value: null }, 30), null)
  assert.equal(measureVerdict({ kind: "check", min_value: null, max_value: null }, 30), null)
  assert.equal(measureVerdict(m, null), null)
  assert.equal(measureVerdict(m, Number.NaN), null)
  assert.equal(toleranceText({ min_value: 40, max_value: 60, unit: "mm" }), "40 to 60 mm")
  assert.equal(toleranceText({ min_value: 25, max_value: null, unit: "mm" }), "at least 25 mm")
  assert.equal(toleranceText({ min_value: null, max_value: 3, unit: null }), "at most 3")
})
test("QA defects: due state, wording, default due dates and numbering", () => {
  assert.deepEqual(dueState({ status: "open", due_date: "2026-10-09" }, "2026-10-11"), { state: "overdue", days: -2 })
  assert.equal(dueState({ status: "open", due_date: "2026-10-13" }, "2026-10-11").state, "due_soon")
  assert.equal(dueState({ status: "in_progress", due_date: "2026-10-20" }, "2026-10-11").state, "ok")
  assert.equal(dueState({ status: "closed", due_date: "2020-01-01" }, "2026-10-11").state, "closed")
  assert.equal(dueText({ status: "open", due_date: "2026-10-10" }, "2026-10-11"), "1 day overdue")
  assert.equal(dueText({ status: "open", due_date: "2026-10-11" }, "2026-10-11"), "Due today")
  assert.equal(dueText({ status: "open", due_date: "2026-10-14" }, "2026-10-11"), "Due in 3 days")
  assert.equal(defaultDueDate("critical", "2026-10-11"), "2026-10-14")
  assert.equal(defaultDueDate("major", "2026-10-11"), "2026-10-18")
  assert.equal(defaultDueDate("minor", "2026-10-11"), "2026-10-25")
  assert.equal(refNumber("ir", 7), "IR-0007")
  assert.equal(refNumber("ncr", 12345), "NCR-12345")
})
test("QA checklist editor: problems are reported before saving", () => {
  const item = (over = {}) => ({ text: "Cover as drawn", severity: "major", kind: "check", unit: "", min_value: "", max_value: "", reference: "", requires_photo: false, hold_point: false, ...over })
  assert.match(checklistProblem("ab", [item()]), /name/)
  assert.match(checklistProblem("Slab list", []), /at least one/)
  assert.match(checklistProblem("Slab list", [item({ text: "x" })]), /Item 1/)
  assert.match(checklistProblem("Slab list", [item(), item({ kind: "measure", min_value: "9", max_value: "1" })]), /Item 2.*above/)
  assert.match(checklistProblem("Slab list", [item({ kind: "measure", min_value: "abc" })]), /numbers/)
  assert.equal(checklistProblem("Slab list", [item({ kind: "measure", min_value: "40", max_value: "60", unit: "mm" })]), "")
})

test("QA badges and pin quality warning: engineer counts decisions, foreman counts own repairs, warnings are specific", () => {
  const irs = [{ status: "requested" }, { status: "in_progress" }, { status: "requested" }]
  const ncrs = [{ status: "for_verification", assigned_to: "f1" }, { status: "open", assigned_to: "f1" }, { status: "in_progress", assigned_to: "f2" }, { status: "for_verification", assigned_to: "f2" }]
  assert.equal(qaBadge("engineer", "e1", irs, ncrs), 4)
  assert.equal(qaBadge("foreman", "f1", irs, ncrs), 1)
  assert.equal(qaBadge("foreman", "f2", irs, ncrs), 1)
  assert.equal(qaBadge("foreman", null, irs, ncrs), 0)
  assert.equal(pinQualityWarning(null), "")
  assert.equal(pinQualityWarning({ inspections: [{ status: "passed" }], defects: [{ status: "closed" }] }), "")
  assert.match(pinQualityWarning({ inspections: [{ status: "failed" }, { status: "passed" }], defects: [] }), /latest inspection FAILED/)
  assert.match(pinQualityWarning({ inspections: [{ status: "requested" }, { status: "passed" }], defects: [{ status: "open" }, { status: "for_verification" }] }), /still open, 2 defects are still open/)
  assert.match(pinQualityWarning({ inspections: [], defects: [{ status: "open" }] }), /1 defect is still open/)
})

test("client report wording: plain-language progress for every status and fix stage", () => {
  assert.match(fixStageText("submitted", null), /look at it/)
  assert.match(fixStageText("declined", null), /explained/)
  assert.match(fixStageText("withdrawn", null), /withdrew/)
  assert.match(fixStageText("accepted", "open"), /crew will be assigned/)
  assert.match(fixStageText("accepted", "in_progress"), /fixing it now/)
  assert.match(fixStageText("accepted", "for_verification"), /being checked/)
  assert.match(fixStageText("resolved", "closed"), /checked the repair/)
  assert.equal(refNumber("snag", 5), "SR-0005")
})

test("notification emails: escaped, links only for safe in-app paths on an https app address", () => {
  assert.equal(appBase("https://buildtrack.example.com/some/path"), "https://buildtrack.example.com")
  assert.equal(appBase("http://localhost:8443"), "http://localhost:8443")
  assert.equal(appBase("http://evil.example.com"), "")
  assert.equal(appBase("javascript:alert(1)"), "")
  assert.equal(appBase(""), "")
  assert.equal(absoluteLink("https://a.example", "/engineer/qa?project=1&tab=defects"), "https://a.example/engineer/qa?project=1&tab=defects")
  assert.equal(absoluteLink("https://a.example", "//evil.example.com/x"), "")
  assert.equal(absoluteLink("https://a.example", "/x?y=<script>"), "")
  assert.equal(absoluteLink("", "/engineer/qa"), "")
  assert.equal(absoluteLink("https://a.example", null), "")
  const mail = buildEmail({ id: "1", kind: "qa.defect", title: "NCR-0003 <b>major</b>", body: "Due 18 Oct & fix \"now\"", link: "/foreman/issues?project=p1&defect=d1", to_email: "f@x.test", to_name: "Frank Foreman" }, "https://app.example.com")
  assert.match(mail.html, /Hello Frank,/)
  assert.ok(!mail.html.includes("<b>major</b>") && mail.html.includes("&lt;b&gt;major&lt;/b&gt;"))
  assert.ok(mail.html.includes("&amp; fix &quot;now&quot;"))
  assert.ok(mail.html.includes('href="https://app.example.com/foreman/issues?project=p1&amp;defect=d1"'))
  assert.match(mail.text, /Open it: https:\/\/app\.example\.com\/foreman\/issues/)
  const plain = buildEmail({ id: "2", kind: "x", title: "Hi", body: null, link: "/client/overview", to_email: "c@x.test", to_name: null }, "")
  assert.match(plain.html, /Hello there,/)
  assert.ok(!plain.html.includes("href="))
  assert.match(plain.text, /Open BuildTrack to see the details/)
})

test("identity form rules: age on a date, details problems in order, ID types, photo checks, masked ID", () => {
  assert.equal(ageOn("1990-05-17", "2026-10-12"), 36)
  assert.equal(ageOn("2008-10-13", "2026-10-12"), 17) // birthday tomorrow
  assert.equal(ageOn("2008-10-12", "2026-10-12"), 18)
  assert.equal(ageOn("", "2026-10-12"), null)
  const ok = { legalName: "Ida Dela Cruz", birthDate: "1990-05-17", address: "12 Mabini St, Valenzuela City", phone: "+63 912 345 6789", idType: "philsys", idLast4: "4821", idExpiry: "" }
  const today = "2026-10-12"
  assert.equal(detailsProblem(ok, today), "")
  assert.match(detailsProblem({ ...ok, legalName: "I" }, today), /legal name/)
  assert.match(detailsProblem({ ...ok, birthDate: "" }, today), /date of birth/)
  assert.match(detailsProblem({ ...ok, birthDate: "2015-01-01" }, today), /18/)
  assert.match(detailsProblem({ ...ok, address: "short" }, today), /address/)
  assert.match(detailsProblem({ ...ok, phone: "abc" }, today), /phone/)
  assert.match(detailsProblem({ ...ok, idType: "" }, today), /type of ID/)
  assert.match(detailsProblem({ ...ok, idLast4: "12" }, today), /last 3 or 4/)
  assert.match(detailsProblem({ ...ok, idExpiry: "2020-01-01" }, today), /expired/)
  assert.equal(detailsProblem({ ...ok, idExpiry: "2030-01-01" }, today), "")
  assert.equal(idTypes.find((item) => item.value === "passport").hasBack, false)
  assert.equal(idTypes.find((item) => item.value === "philsys").hasBack, true)
  assert.equal(idTypeLabel("umid"), "UMID")
  assert.equal(fileProblem(null), "Choose a photo.")
  assert.match(fileProblem({ type: "application/pdf", size: 10 }), /JPEG/)
  assert.match(fileProblem({ type: "image/png", size: 0 }), /empty/)
  assert.match(fileProblem({ type: "image/png", size: 30 * 1024 * 1024 }), /too large/)
  assert.equal(fileProblem({ type: "image/webp", size: 1000 }), "")
  assert.equal(maskedId("ab12"), "•••• AB12")
})
test("privacy notice: every scope says what is collected, why, who sees it and how long", () => {
  assert.match(PRIVACY_VERSION, /^\d{4}-\d{2}$/)
  for (const [scope, notice] of Object.entries(privacyScopes)) {
    assert.ok(notice.title.length > 5 && notice.collects.length > 0 && notice.purpose.length > 20 && notice.access.length > 10 && notice.keptFor.length > 10, scope)
  }
  assert.match(privacyScopes.identity.access, /audit log/)
  assert.match(privacyScopes.identity.keptFor, /deleted/)
})

// ---- S-curve (planned vs verified) ----
{
  const pin = (category, status, due_date, verified_at = null) => ({ category, status, due_date, verified_at })
  const pins = [
    pin("progress", "verified", "2026-01-10", "2026-01-09T03:00:00Z"),
    pin("progress", "verified", "2026-01-20", "2026-01-25T03:00:00Z"),
    pin("quality", "in_progress", "2026-01-30"),
    pin("progress", "not_started", null),
    pin("note", "not_started", "2026-01-05"),
  ]
  const curve = sCurve(pins, "2026-01-01", "2026-02-01", "2026-01-26", 40)
  test("sCurve ignores notes and counts items without a due date in the total only", () => {
    assert.equal(curve.total, 4)
    assert.equal(curve.undated, 1)
  })
  test("sCurve planned is cumulative by due date; verified by verification date (Manila), never in the future", () => {
    const at = (date) => curve.points.find((point) => point.date === date)
    assert.equal(at("2026-01-26").planned, 50)
    assert.equal(at("2026-01-26").verified, 50)
    assert.equal(at("2026-02-01").planned, 75)
    assert.equal(at("2026-02-01").verified, null)
    assert.equal(curve.points[curve.todayIndex].date, "2026-01-26")
    for (let i = 1; i < curve.points.length; i++) assert.ok(curve.points[i].planned >= curve.points[i - 1].planned, "planned never drops")
  })
  test("sCurve spans project start to end (and stretches to late due dates or today), with a bounded number of points", () => {
    assert.equal(curve.points[0].date, "2026-01-01")
    assert.equal(curve.points[curve.points.length - 1].date, "2026-02-01")
    const late = sCurve([pin("progress", "not_started", "2026-06-30")], "2026-01-01", "2026-02-01", "2026-01-15", 20)
    assert.equal(late.points[late.points.length - 1].date, "2026-06-30")
    assert.ok(late.points.length <= 22)
    assert.equal(sCurve([pin("note", "verified", null)], null, null, "2026-01-01"), null)
    assert.equal(addDays("2026-02-28", 1), "2026-03-01")
  })
}

// ---- Paging: every row is read, page by page ----
{
  const asked = []
  const fake = (rows, failAt = -1) => (from, to) => {
    asked.push([from, to])
    if (from === failAt) return Promise.resolve({ data: null, error: { message: "boom" } })
    return Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(to, rows - 1) - from + 1) }, (_, i) => from + i), error: null })
  }
  const big = await fetchAll(fake(2500), 1000)
  const exact = await fetchAll(fake(2000), 1000)
  const failed = await fetchAll(fake(2500, 1000), 1000)
  const capped = await fetchAll(fake(5000), 1000, 3000)
  test("fetchAll reads past the 1,000-row page limit and stops on a short page", () => {
    assert.equal(big.data.length, 2500)
    assert.equal(big.error, false)
    assert.deepEqual(asked.slice(0, 3), [[0, 999], [1000, 1999], [2000, 2999]])
    assert.equal(exact.data.length, 2000)
  })
  test("fetchAll reports an error and a hard cap", () => {
    assert.equal(failed.error, true)
    assert.equal(failed.data.length, 1000)
    assert.equal(capped.data.length, 3000)
  })
}

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`)

Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap 2048,1540
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$graphics.SmoothingMode = 'AntiAlias'
$graphics.TextRenderingHint = 'AntiAliasGridFit'
$slate = [System.Drawing.ColorTranslator]::FromHtml('#4C6170')
$teal = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#31575B'))
$arrowBrush = New-Object System.Drawing.SolidBrush $slate
$pen = New-Object System.Drawing.Pen $slate,6
$black = [System.Drawing.Brushes]::Black
function Font([int]$size,[bool]$bold=$false) {
    $style = [System.Drawing.FontStyle]::Regular
    if ($bold) { $style = [System.Drawing.FontStyle]::Bold }
    return New-Object System.Drawing.Font 'Arial',$size,$style,([System.Drawing.GraphicsUnit]::Pixel)
}
$body = Font 34
$category = Font 36 $true
$heading = Font 66 $true
$process = Font 45
$title = Font 49
$titleBold = Font 52 $true
$evaluation = Font 48 $true
function Wrapped([string]$text,[float]$x,[float]$y,[float]$width,$font,[int]$lineHeight,[bool]$center=$false) {
    $line = ''
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($word in ($text -split ' ')) {
        $candidate = ($line + ' ' + $word).Trim()
        if ($line -and $graphics.MeasureString($candidate,$font).Width -gt $width) {
            $lines.Add($line); $line = $word
        } else { $line = $candidate }
    }
    if ($line) { $lines.Add($line) }
    foreach ($row in $lines) {
        $left = $x
        if ($center) { $left += ($width-$graphics.MeasureString($row,$font).Width)/2 }
        $graphics.DrawString($row,$font,$black,$left,$y)
        $y += $lineHeight
    }
    return $y
}
function Bullet([string]$text,[float]$x,[float]$y,[float]$width,$font,[int]$lineHeight) {
    $graphics.FillEllipse($black,$x,($y+17),11,11)
    return Wrapped $text ($x+29) $y ($width-29) $font $lineHeight
}
foreach ($box in @(@(80,55,585,1410),@(750,55,565,1140),@(1435,55,555,1140))) {
    $graphics.DrawRectangle($pen,$box[0],$box[1],$box[2],$box[3])
}
foreach ($h in @(@('INPUT',80,585),@('PROCESS',750,565),@('OUTPUT',1435,555))) {
    $w = $graphics.MeasureString($h[0],$heading).Width
    $graphics.DrawString($h[0],$heading,$teal,($h[1]+($h[2]-$w)/2),90)
}
$y = Wrapped 'Knowledge Requirements:' 105 195 535 $category 44
foreach ($item in @(
    '2D Coordinate Normalization for pin placement',
    'PWA Offline Architecture',
    'Republic Act No. 10173 (Data Privacy Act of 2012)',
    'ISO/IEC 27001:2022 (selected controls) and ISO/IEC 25010:2023',
    'Quality conformance rules (weighted scoring and pass threshold)'
)) { $y = Bullet $item 125 $y 510 $body 41 }
$y += 28
$y = Wrapped 'Software Requirements:' 105 $y 535 $category 44
foreach ($item in @(
    'Supabase Backend and Relational Database (PostgreSQL)',
    'Progressive Web App (PWA) with Service Worker',
    'Modern Web Browsers',
    'Cloud Hosting'
)) { $y = Bullet $item 125 $y 510 $body 41 }
$y += 28
$y = Wrapped 'Hardware Requirements:' 105 $y 535 $category 44
foreach ($item in @(
    'Mobile, Tablet, and Desktop Devices',
    'Device Cameras for photo evidence',
    'AS608 Sensor and ESP32 (physical integration pending)'
)) { $y = Bullet $item 125 $y 510 $body 41 }
if ($y -gt 1445) { throw "Input content overflows: $y" }
$y = 240
foreach ($item in @(
    'Gather System Requirements',
    'Design Database & PWA Architecture',
    'Develop System Modules',
    'Integrate Offline Queue & Cloud Sync',
    'Perform System & Security Testing',
    'Evaluate System Quality (ISO/IEC 25010:2023)'
)) { $y = Bullet $item 785 $y 495 $process 54; $y += 13 }
if ($y -gt 1170) { throw "Process content overflows: $y" }
$null = Wrapped 'BUILDTRACK' 1465 300 495 $titleBold 65 $true
$null = Wrapped 'An Integrated 2D-Mapping Platform for Site Progress, Quality Assurance Logging, and Biometric Workforce Management for Valencia Construction Services' 1465 370 495 $title 65 $true
foreach ($x in @(595,1265)) {
    $graphics.FillPolygon($arrowBrush,[System.Drawing.Point[]]@(
        [System.Drawing.Point]::new($x,665),[System.Drawing.Point]::new(($x+96),665),
        [System.Drawing.Point]::new(($x+96),625),[System.Drawing.Point]::new(($x+190),685),
        [System.Drawing.Point]::new(($x+96),745),[System.Drawing.Point]::new(($x+96),705),
        [System.Drawing.Point]::new($x,705)
    ))
}
$feedback = New-Object System.Drawing.Pen $slate,23
$feedback.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 4,5,$true
$graphics.DrawBezier($feedback,1710,1198,1620,1515,1140,1515,1045,1230)
$null = Wrapped 'EVALUATION' 1160 1310 450 $evaluation 58 $true
$bitmap.Save((Join-Path $PSScriptRoot 'chapter-2-ipo.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

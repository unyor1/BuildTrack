Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot 'chapter-3-figures'
[void](New-Item -ItemType Directory -Force -Path $out)
function Start-Figure([int]$height=1320) {
 $script:b = New-Object Drawing.Bitmap 1440,$height
 $script:g = [Drawing.Graphics]::FromImage($b)
 $g.Clear([Drawing.Color]::White); $g.SmoothingMode='AntiAlias'; $g.TextRenderingHint='AntiAliasGridFit'
 $script:p = New-Object Drawing.Pen ([Drawing.Color]::Black),3
 $script:f = New-Object Drawing.Font 'Arial',34,([Drawing.FontStyle]::Regular),([Drawing.GraphicsUnit]::Pixel)
 $script:fb = New-Object Drawing.Font 'Arial',36,([Drawing.FontStyle]::Bold),([Drawing.GraphicsUnit]::Pixel)
}
function Text([string]$s,[float]$x,[float]$y,[float]$w,[float]$h,[bool]$bold=$false) {
 $fmt=New-Object Drawing.StringFormat; $fmt.Alignment='Center'; $fmt.LineAlignment='Center'
 $font=$f; if($bold){$font=$fb}
 $g.DrawString($s,$font,[Drawing.Brushes]::Black,([Drawing.RectangleF]::new($x,$y,$w,$h)),$fmt); $fmt.Dispose()
}
function Box([string]$s,[int]$x,[int]$y,[int]$w,[int]$h,[bool]$dash=$false) {
 if($dash){$p.DashStyle='Dash'}; $g.DrawRectangle($p,$x,$y,$w,$h); $p.DashStyle='Solid'
 Text $s ($x+12) ($y+8) ($w-24) ($h-16)
}
function Line([int]$x,[int]$y,[int]$xx,[int]$yy){$g.DrawLine($p,$x,$y,$xx,$yy)}
function Arrow([int]$x,[int]$y,[int]$xx,[int]$yy,[bool]$dash=$false){
 if($dash){$p.DashStyle='Dash'}; $p.EndCap='ArrowAnchor'; $g.DrawLine($p,$x,$y,$xx,$yy); $p.EndCap='Flat'; $p.DashStyle='Solid'
}
function Diamond([string]$s,[int]$x,[int]$y,[int]$w,[int]$h){
 $pts=[Drawing.Point[]]@([Drawing.Point]::new($x+$w/2,$y),[Drawing.Point]::new($x+$w,$y+$h/2),[Drawing.Point]::new($x+$w/2,$y+$h),[Drawing.Point]::new($x,$y+$h/2))
 $g.DrawPolygon($p,$pts); Text $s ($x+$w*.19) ($y+$h*.19) ($w*.62) ($h*.62)
}
function Save-Figure([int]$n){$b.Save((Join-Path $out "figure-$n.png"),[Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$b.Dispose();$p.Dispose();$f.Dispose();$fb.Dispose()}

# Figure 1. Deliverables, not a claim of completion.
Start-Figure 960
Box 'BuildTrack project deliverables' 340 20 800 100
Line 720 120 720 140; Line 120 140 720 140; Line 120 140 120 770
$items=@(
 @('1.0 Project initiation and documentation','Title proposals and defense; Chapters 1 to 3'),
 @('2.0 System design','Wireframes; architecture; data flows; roles and permissions'),
 @('3.0 Software development','Projects and plans; work pins and QA; workforce; client portal; selected offline submissions and reports'),
 @('4.0 Biometric hardware development','AS608 and reused ESP32; verified circuit; enclosure; connection and device validation (pending)'),
 @('5.0 Testing and defense preparation','Functional/integration checks; user evaluation; results; demonstration and manuscript review')
)
$y=145
foreach($it in $items){Line 120 ($y+65) 220 ($y+65); Box ($it[0]+"`n"+$it[1]) 220 $y 1160 130; $y+=140}
Text 'Work packages include both completed and pending deliverables.' 100 875 1240 60
Save-Figure 1

# Figure 2. Weekly activity windows are supported by the original progress workbook.
Start-Figure 1200
Text 'Recorded activity windows and proposed remaining schedule (2026)' 20 10 1400 80 $true
$labels=@('Sep 7','Sep 14','Sep 21','Sep 28','Oct 5','Oct 12','Oct 19','Oct 26','Nov 2','Nov 9','Nov 16')
$left=505; $cw=80; $top=170; $rh=78
Text 'Activity / deliverable' 20 100 470 60 $true
for($c=0;$c -lt 11;$c++){Text $labels[$c] ($left+$c*$cw) 90 $cw 75; Line ($left+$c*$cw) $top ($left+$c*$cw) 1028}
$rows=@(
 @('Title proposals and defense',0,1,0),@('Chapter 1 and client analysis',2,6,0),
 @('Chapter 2 drafting / revision',3,6,0),@('Core software and QA iterations',4,6,0),
 @('Workforce / client refinements',6,6,0),@('Chapter 3 drafting / revision',5,6,0),
 @('Diagrams, instruments and review',7,7,1),@('Physical biometric integration',7,8,1),
 @('Screenshots and test execution',8,8,1),@('Compile, rehearse and submit',9,9,1),
 @('Defense: Nov 14 OR Nov 17, TBC',9,10,1)
)
for($r=0;$r -lt $rows.Count;$r++){
 $it=$rows[$r];$y=$top+$r*$rh;Text $it[0] 10 $y 480 $rh; Line 20 ($y+$rh) 1385 ($y+$rh)
 $x=$left+$it[1]*$cw+7;$w=($it[2]-$it[1]+1)*$cw-14
 if($it[3] -eq 0){$g.FillRectangle([Drawing.Brushes]::Gray,$x,($y+24),$w,30)}else{$p.DashStyle='Dash';$g.DrawRectangle($p,$x,($y+24),$w,30);$p.DashStyle='Solid'}
}
Text 'Solid: recorded weekly activity, through Oct 22. Dashed: planned activity.' 30 1050 1380 60
Text 'Weeks begin on the date shown. Bars do not represent completion percentages.' 30 1110 1380 60
Save-Figure 2

# Figure 3. Manual completion and failure/correction loop.
Start-Figure 1220
Box 'Administrator: create project, assign team and upload plan' 20 20 630 130
Arrow 650 85 780 85
Box 'Engineer: place work pin; define checklist / QA criteria; assign Foreman' 780 20 640 130
Arrow 1100 150 1100 195
Box 'Foreman: submit eligible item with photographs and remarks for QA' 780 195 640 130
Arrow 1100 325 1100 370
Box 'Engineer: inspect and record decision' 780 370 640 100
Arrow 1100 470 1100 510
Diamond 'QA passed?' 800 510 600 160
Arrow 800 590 650 590;Text 'No' 650 525 150 50
Box 'NCR / failed findings' 370 520 280 160
Arrow 370 600 300 600
Box 'Foreman: correct and resubmit evidence' 20 520 280 160
Line 160 520 160 260; Arrow 160 260 780 260
Text 'Resubmit for inspection' 260 190 460 65
Arrow 1100 670 1100 720;Text 'Yes' 1120 670 150 45
Diamond 'Linked NCRs closed?' 800 720 600 180
Arrow 800 810 650 810;Text 'No' 650 740 150 50
Box 'Resolve NCRs and reinspect as required' 370 730 280 160
Line 370 810 160 810;Arrow 160 810 160 680
Line 1100 900 1100 930;Line 1100 930 340 930;Arrow 340 930 340 960
Text 'Yes' 1120 895 150 45
Box 'Engineer explicitly selects Complete checklist' 20 960 650 130
Arrow 670 1025 780 1025
Box 'Pin completes when all items and applicable QA / NCR / hold-point conditions are clear' 780 960 640 160
Text 'Progress counts completed work pins; notes are excluded. QA pass alone does not complete work.' 100 1135 1240 75
Save-Figure 3

# Figure 4. Context-level exchanges, without internal data stores.
Start-Figure 1440
$f.Dispose();$script:f=New-Object Drawing.Font 'Arial',32,([Drawing.FontStyle]::Regular),([Drawing.GraphicsUnit]::Pixel)
Box "0`nBuildTrack" 560 50 320 1240
Box 'Administrator' 10 90 280 260
Box 'Engineer' 10 500 280 260
Box 'Foreman' 10 910 280 260
Box 'Client' 1150 290 280 260
Box 'Trusted biometric device' 1150 880 280 280 $true
Text 'Accounts, projects, workers, enrollment' 295 70 260 140
Arrow 290 220 560 220
Text 'Management records' 295 230 260 100
Arrow 560 345 290 345
Text 'Pins, criteria, QA decisions' 295 480 260 140
Arrow 290 630 560 630
Text 'Evidence, NCRs, project records' 295 640 260 115
Arrow 560 770 290 770
Text 'Evidence and daily reports' 295 890 260 140
Arrow 290 1040 560 1040
Text 'Assigned work / workforce records' 295 1050 260 130
Arrow 560 1190 290 1190
Text 'Questions / problem reports' 885 270 260 120
Arrow 1150 400 880 400
Text 'Authorized project information' 885 420 260 120
Arrow 880 550 1150 550
Text 'Enrollment results / attendance events' 885 850 260 140
Arrow 1150 1000 880 1000 $true
Text 'Enrollment jobs / responses' 885 1020 260 120
Arrow 880 1160 1150 1160 $true
Text 'Dashed device interface: software built; physical terminal unconnected. Workers are not website accounts.' 50 1320 1340 100
Save-Figure 4

# Figure 7. No installation location, actual wiring or physical tests asserted.
Start-Figure 1260
Box 'Owned laptops / staff and client web devices' 100 30 1240 120
Arrow 720 150 720 250
Box 'Internet connection' 430 250 580 100
Arrow 720 350 720 450
Box 'Hosted BuildTrack web application and protected backend services' 250 450 940 140
Text 'Authorized browsers: Administrator, Engineer, Foreman and Client' 80 620 1280 80
Box 'Selected eligible submissions: local queue on the user device; retry after reconnection' 100 730 1240 130
Box 'Proposed AS608 fingerprint sensor' 70 1010 430 130 $true
Box 'Reused ESP32 controller' 570 1010 350 130 $true
Arrow 500 1075 570 1075 $true
$p.DashStyle='Dash';Line 920 1075 1400 1075;Line 1400 1075 1400 520;Arrow 1400 520 1190 520 $true;$p.DashStyle='Solid'
Text 'Authenticated internet request to device receiver' 950 880 440 110
Text 'Dashed: proposed physical terminal. Installation, wiring and acceptance testing remain pending.' 60 1170 1320 80
Save-Figure 7

# Figure 8. Three tiers; project-scoped software permissions and isolated device credentials.
Start-Figure 1390
Text 'Presentation tier' 40 10 1360 70 $true
Box 'React + TypeScript: Valencia public page / BuildTrack landing' 70 90 1300 100
Box 'Protected role workspaces: Admin / Engineer / Foreman / Client' 70 220 1300 100
Box 'PWA shell and selected local submission queue (not all records offline)' 70 350 1300 100
Arrow 720 450 720 505
Text 'Application and data tier' 40 505 1360 70 $true
Box 'Supabase Auth + server-enforced role and project permissions' 70 590 1300 100
Arrow 720 690 720 725
Box 'PostgreSQL: projects, pins, QA / NCR, workers, attendance and reports' 70 725 1300 100
Box 'Private Storage: plans / evidence     |     Realtime updates' 70 855 1300 100
Box 'Edge Functions: protected processing, device receiver and email integration' 70 985 1300 100
Arrow 450 1085 450 1160;Arrow 1080 1085 1080 1160 $true
Box 'External services: Google sign-in; configured Brevo email' 70 1160 710 130
Box 'Proposed AS608 / ESP32: scoped device credentials' 840 1160 530 130 $true
Text 'Fingerprint matching remains on the sensor. Physical device validation is pending.' 70 1310 1300 65
Save-Figure 8
Write-Output 'Generated Figures 1, 2, 3, 4, 7 and 8.'

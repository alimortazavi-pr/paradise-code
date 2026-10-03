import AppKit
let output = CommandLine.arguments[1]
let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:rep)
NSColor(calibratedRed:0.055,green:0.09,blue:0.11,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:40,y:40,width:944,height:944),xRadius:210,yRadius:210).fill()
let color=NSColor(calibratedRed:0.44,green:0.91,blue:0.80,alpha:1)
color.setStroke()
let left=NSBezierPath();left.move(to:NSPoint(x:360,y:715));left.line(to:NSPoint(x:170,y:512));left.line(to:NSPoint(x:360,y:309));left.lineWidth=58;left.lineCapStyle = .round;left.lineJoinStyle = .round;left.stroke()
let right=NSBezierPath();right.move(to:NSPoint(x:690,y:715));right.line(to:NSPoint(x:880,y:512));right.line(to:NSPoint(x:690,y:309));right.lineWidth=58;right.lineCapStyle = .round;right.lineJoinStyle = .round;right.stroke()
NSColor.white.setStroke()
let stem=NSBezierPath();stem.move(to:NSPoint(x:462,y:278));stem.line(to:NSPoint(x:462,y:733));stem.line(to:NSPoint(x:528,y:733));stem.curve(to:NSPoint(x:528,y:500),controlPoint1:NSPoint(x:688,y:733),controlPoint2:NSPoint(x:688,y:500));stem.line(to:NSPoint(x:462,y:500));stem.lineWidth=52;stem.lineCapStyle = .round;stem.lineJoinStyle = .round;stem.stroke()
NSGraphicsContext.restoreGraphicsState()
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:output))

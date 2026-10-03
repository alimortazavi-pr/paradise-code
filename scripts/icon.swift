import AppKit
let output = CommandLine.arguments[1]
let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:rep)
let background = NSBezierPath(roundedRect:NSRect(x:52,y:52,width:920,height:920),xRadius:208,yRadius:208)
NSGradient(starting:NSColor(calibratedRed:0.17,green:0.14,blue:0.26,alpha:1),ending:NSColor(calibratedRed:0.055,green:0.05,blue:0.08,alpha:1))!.draw(in:background,angle:270)
func face(_ points:[(Double,Double)], _ color:NSColor) {
    let p=NSBezierPath();for (i,point) in points.enumerated(){let pt=NSPoint(x:point.0*3.4+77,y:1024-(point.1*3.4+65));if i==0{p.move(to:pt)}else{p.line(to:pt)}};p.close();color.setFill();p.fill()
}
face([(56,58),(150,34),(208,70),(208,138),(110,166),(110,226),(56,195)],NSColor(calibratedRed:0.66,green:0.63,blue:1,alpha:1))
face([(56,58),(110,90),(110,226),(56,195)],NSColor(calibratedRed:0.91,green:0.90,blue:1,alpha:1))
face([(56,58),(150,34),(208,70),(110,98)],.white)
face([(110,98),(208,70),(208,138),(110,166),(110,129),(170,112),(170,94),(110,112)],NSColor(calibratedRed:0.59,green:0.53,blue:1,alpha:1))
face([(110,98),(170,81),(170,112),(110,129)],NSColor(calibratedRed:0.09,green:0.08,blue:0.14,alpha:1))
NSGraphicsContext.restoreGraphicsState()
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:output))

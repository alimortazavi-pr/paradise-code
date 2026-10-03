import AppKit
let rep = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:1200,pixelsHigh:630,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:rep)
NSColor(calibratedRed:0.065,green:0.055,blue:0.085,alpha:1).setFill()
NSRect(x:0,y:0,width:1200,height:630).fill()
let path=NSBezierPath(rect:NSRect(x:820,y:0,width:380,height:630))
NSGradient(starting:NSColor(calibratedRed:0.17,green:0.12,blue:0.27,alpha:1),ending:NSColor(calibratedRed:0.34,green:0.27,blue:0.56,alpha:1))!.draw(in:path,angle:90)
let icon=NSImage(contentsOfFile:"icons/icon.png")!
icon.draw(in:NSRect(x:804,y:177,width:330,height:330))
func text(_ value:String,_ x:Double,_ y:Double,_ size:Double,_ color:NSColor,_ weight:NSFont.Weight = .regular) {
(value as NSString).draw(at:NSPoint(x:x,y:y),withAttributes:[.font:NSFont.systemFont(ofSize:size,weight:weight),.foregroundColor:color])
}
text("Paradise Code",72,499,27,.white,.semibold)
text("Your next idea.",68,332,65,.white,.bold)
text("A space to make it.",68,251,65,NSColor(calibratedRed:0.78,green:0.73,blue:0.96,alpha:1),.bold)
text("A local, open-source editor for your Mac.",72,167,24,NSColor(calibratedWhite:0.7,alpha:1))
text("ide.paradisecode.ir",72,66,20,NSColor(calibratedWhite:0.7,alpha:1))
NSGraphicsContext.restoreGraphicsState()
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:"website/assets/social.png"))

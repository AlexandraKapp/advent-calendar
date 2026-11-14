// Macht aus Fotos die 5 Schärfestufen für „Wer ist das?“ und schreibt eine SQL-Datei.
// Die Fotos und die SQL-Datei gehören in den Ordner private/ (nicht auf GitHub!).
//
// Aufruf:
//   swift tools/wer-ist-das.swift <türchen> <ausgabe.sql> "foto1.jpg=Lena" "foto2.heic=Max;Maxi;Maximilian" ...
// Hinter dem Namen können nach ; weitere Schreibweisen stehen, die auch als richtig gelten.
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 4, let day = Int(args[1]) else {
  print("Aufruf: swift tools/wer-ist-das.swift <türchen> <ausgabe.sql> \"bild.jpg=Name;variante\" ..."); exit(1)
}
let out = args[2]
// Längste Bildseite je Stufe: winzig = stark verschwommen, wenn der Browser es groß zieht
let sizes = [14, 26, 50, 100, 900]
let quality = [0.7, 0.7, 0.75, 0.75, 0.8]

func esc(_ s: String) -> String { s.replacingOccurrences(of: "'", with: "''") }

func stage(_ src: CGImageSource, _ maxPx: Int, _ q: Double) -> String? {
  let opts: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true, // Handy-Fotos richtig herum drehen
    kCGImageSourceThumbnailMaxPixelSize: maxPx,
  ]
  guard let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
  let data = NSMutableData()
  guard let dest = CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
  CGImageDestinationAddImage(dest, img, [kCGImageDestinationLossyCompressionQuality: q] as CFDictionary)
  guard CGImageDestinationFinalize(dest) else { return nil }
  return "data:image/jpeg;base64," + (data as Data).base64EncodedString()
}

var sql = "-- Wer ist das? Türchen \(day). Enthält Fotos und Lösungen: nur lokal aufbewahren!\nbegin;\n"
sql += "delete from public.raten_bilder where day = \(day);\n"
for (i, arg) in args.dropFirst(3).enumerated() {
  let parts = arg.split(separator: "=", maxSplits: 1).map(String.init)
  guard parts.count == 2 else { print("Fehlt =Name bei: \(arg)"); exit(1) }
  let names = parts[1].split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
  let url = URL(fileURLWithPath: parts[0])
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { print("Kann Bild nicht lesen: \(parts[0])"); exit(1) }
  var stages: [String] = []
  for (k, px) in sizes.enumerated() {
    guard let s = stage(src, px, quality[k]) else { print("Fehler bei \(parts[0])"); exit(1) }
    stages.append(s)
  }
  let accepted = names.map { "'\(esc($0))'" }.joined(separator: ", ")
  sql += "insert into public.raten_bilder (day, nr, solution, accepted, stages) values (\(day), \(i + 1), '\(esc(names[0]))', array[\(accepted)]::text[], array[\(stages.map { "'\($0)'" }.joined(separator: ", "))]);\n"
  print("Bild \(i + 1): \(names[0])  (scharf: \(stages[4].count / 1024) KB)")
}
sql += "commit;\n"
try! sql.write(toFile: out, atomically: true, encoding: .utf8)
print("Geschrieben: \(out)")

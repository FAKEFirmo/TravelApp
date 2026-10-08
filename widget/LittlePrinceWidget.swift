// macOS widget: the stylized globe with your visited countries and routes, turning slowly.
// Widgets can't animate live, so the timeline holds one picture every 10 minutes, each turned a bit further.
// Data comes from the app (widget.json in the shared App Group folder), country shapes from world.json.
import SwiftUI
import WidgetKit

struct WidgetData: Decodable {
    var visited: [String] = []
    var arcs: [[Double]] = []      // [lat1, lng1, lat2, lng2]
    var colors: [String] = []      // one hex colour per arc
    var dots: [[Double]] = []      // [lat, lng]
    var countries = 0, km = 0, trips = 0
}

struct Country: Decodable {
    let n: String            // name, as the app uses it
    let p: [[[Double]]]      // rings of [lng, lat]
}

enum Store {
    static let group = Bundle.main.object(forInfoDictionaryKey: "LPAppGroup") as? String
        ?? ProcessInfo.processInfo.environment["LP_APP_GROUP"] ?? "" // env: preview renders outside the widget
    static func data() -> WidgetData? {
        guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group),
              let raw = try? Data(contentsOf: dir.appendingPathComponent("widget.json")) else { return nil }
        return try? JSONDecoder().decode(WidgetData.self, from: raw)
    }
    static let world: [Country] = {
        guard let url = Bundle.main.url(forResource: "world", withExtension: "json"),
              let raw = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([Country].self, from: raw)) ?? []
    }()
}

struct Entry: TimelineEntry {
    let date: Date
    let lng: Double          // longitude facing the viewer
    let data: WidgetData?
}

struct Provider: TimelineProvider {
    static let step: TimeInterval = 600   // 10 minutes
    static let turn = 30.0                // degrees per step: a full turn every 2 hours

    // Same angle for the same time of day, so the rotation continues smoothly across timeline reloads
    static func lng(at date: Date) -> Double {
        (date.timeIntervalSince1970 / step).rounded(.down).truncatingRemainder(dividingBy: 360 / turn) * turn - 180
    }

    func placeholder(in context: Context) -> Entry { Entry(date: .now, lng: 10, data: nil) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now, lng: Self.lng(at: .now), data: Store.data()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let data = Store.data(), start = Date.now
        let first = Date(timeIntervalSince1970: (start.timeIntervalSince1970 / Self.step).rounded(.down) * Self.step)
        let entries = (0..<12).map { i -> Entry in
            let d = first.addingTimeInterval(Double(i) * Self.step)
            return Entry(date: d, lng: Self.lng(at: d), data: data)
        }
        // Reload after 2 hours to pick up new trips (the app also writes fresh data whenever trips change)
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

extension Color {
    init(hex: String) {
        var v: UInt64 = 0
        Scanner(string: hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
    }
    static let sky = Color(hex: "0b1026"), ocean = Color(hex: "13204a"), land = Color(hex: "2b4580")
    static let visited = Color(hex: "e3b25a"), border = Color(hex: "cddaff").opacity(0.25), dot = Color(hex: "fff6dc")
}

/// Orthographic projection onto a globe of radius 1 seen from (lat0, lng0). Points behind the globe are pushed to
/// its edge, which is good enough for country fills at this size.
struct Ortho {
    let lat0: Double, lng0: Double
    func project(lat: Double, lng: Double, lift: Double = 0) -> (CGPoint, Bool) {
        let φ = lat * .pi / 180, λ = (lng - lng0) * .pi / 180, φ0 = lat0 * .pi / 180
        var x = cos(φ) * sin(λ)
        var y = cos(φ0) * sin(φ) - sin(φ0) * cos(φ) * cos(λ)
        let front = sin(φ0) * sin(φ) + cos(φ0) * cos(φ) * cos(λ)
        if front < -lift * 2 { let k = 1 / max(hypot(x, y), 1e-9); x *= k; y *= k; return (CGPoint(x: x, y: -y), false) }
        return (CGPoint(x: x * (1 + lift), y: -y * (1 + lift)), true)
    }
}

/// Point a fraction t of the way along the great circle from a to b (lat/lng in degrees)
func slerp(_ a: (Double, Double), _ b: (Double, Double), _ t: Double) -> (lat: Double, lng: Double) {
    func vec(_ p: (Double, Double)) -> (Double, Double, Double) {
        let φ = p.0 * .pi / 180, λ = p.1 * .pi / 180
        return (cos(φ) * cos(λ), cos(φ) * sin(λ), sin(φ))
    }
    let u = vec(a), v = vec(b)
    let ω = acos(max(-1, min(1, u.0 * v.0 + u.1 * v.1 + u.2 * v.2)))
    if ω < 1e-6 { return a }
    let s1 = sin((1 - t) * ω) / sin(ω), s2 = sin(t * ω) / sin(ω)
    let x = s1 * u.0 + s2 * v.0, y = s1 * u.1 + s2 * v.1, z = s1 * u.2 + s2 * v.2
    return (atan2(z, hypot(x, y)) * 180 / .pi, atan2(y, x) * 180 / .pi)
}

struct GlobeView: View {
    let entry: Entry

    var body: some View {
        let data = entry.data ?? WidgetData()
        ZStack(alignment: .bottom) {
            Canvas { ctx, size in
                let r = min(size.width, size.height) / 2 * 0.86
                let c = CGPoint(x: size.width / 2, y: size.height / 2 - 6)
                let ortho = Ortho(lat0: 25, lng0: entry.lng)
                let at = { (p: CGPoint) in CGPoint(x: c.x + p.x * r, y: c.y + p.y * r) }
                let disc = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))

                // Atmosphere glow, ocean
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - r * 1.08, y: c.y - r * 1.08, width: 2.16 * r, height: 2.16 * r)),
                         with: .radialGradient(Gradient(colors: [Color(hex: "9fb4ff").opacity(0.35), .clear]),
                                               center: c, startRadius: r * 0.9, endRadius: r * 1.08))
                ctx.fill(disc, with: .color(.ocean))

                // Countries
                let visited = Set(data.visited)
                var borders = Path()
                ctx.clip(to: disc)
                for country in Store.world {
                    var shape = Path()
                    for ring in country.p {
                        let pts = ring.map { ortho.project(lat: $0[1], lng: $0[0]) }
                        guard pts.contains(where: { $0.1 }) else { continue }
                        shape.addLines(pts.map { at($0.0) }); shape.closeSubpath()
                    }
                    if shape.isEmpty { continue }
                    ctx.fill(shape, with: .color(visited.contains(country.n) ? .visited : .land))
                    borders.addPath(shape)
                }
                ctx.stroke(borders, with: .color(.border), lineWidth: 0.4)

                // Routes: great circles lifted a little in the middle
                for (i, a) in data.arcs.enumerated() where a.count == 4 {
                    let color = i < data.colors.count ? Color(hex: data.colors[i]) : .visited
                    let from = (a[0], a[1]), to = (a[2], a[3])
                    let span = acos(max(-1, min(1, sin(a[0] * .pi / 180) * sin(a[2] * .pi / 180)
                        + cos(a[0] * .pi / 180) * cos(a[2] * .pi / 180) * cos((a[3] - a[1]) * .pi / 180))))
                    var line = Path(), drawing = false
                    for s in 0...32 {
                        let t = Double(s) / 32, g = slerp(from, to, t)
                        let (p, visible) = ortho.project(lat: g.lat, lng: g.lng, lift: sin(.pi * t) * min(0.25, span * 0.18))
                        if visible { drawing ? line.addLine(to: at(p)) : line.move(to: at(p)); drawing = true } else { drawing = false }
                    }
                    ctx.stroke(line, with: .color(color), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
                }

                // Places
                for d in data.dots where d.count == 2 {
                    let (p, visible) = ortho.project(lat: d[0], lng: d[1])
                    guard visible else { continue }
                    let q = at(p)
                    ctx.fill(Path(ellipseIn: CGRect(x: q.x - 1.8, y: q.y - 1.8, width: 3.6, height: 3.6)), with: .color(.dot))
                }
            }
            Text(data.trips == 0 ? "No trips yet" : "\(data.countries) countries · \(data.km.formatted()) km")
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.dot.opacity(0.9))
                .padding(.bottom, 2)
        }
        .containerBackground(for: .widget) { Color.sky }
    }
}

#if !PREVIEW // scripts can render GlobeView to an image with -DPREVIEW
@main
#endif
struct LittlePrinceWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LittlePrinceGlobe", provider: Provider()) { GlobeView(entry: $0) }
            .configurationDisplayName("Travel globe")
            .description("The places you've been, on a slowly turning globe.")
            .supportedFamilies([.systemSmall, .systemLarge])
    }
}

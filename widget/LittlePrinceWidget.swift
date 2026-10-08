// macOS widget: your visited countries seen from orbit, like a photo from space: an angled view with the curved
// horizon and the atmosphere at the top, framed automatically around the places you've been.
// Widgets can't animate live, so the timeline holds one picture every 10 minutes; the camera sways slowly.
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
    let sway: Double         // camera swing around the visited region, -1…1
    let data: WidgetData?
}

struct Provider: TimelineProvider {
    static let step: TimeInterval = 600   // one picture every 10 minutes
    static let period = 12.0              // steps per back-and-forth swing (2 hours)

    // Same position for the same time, so the motion continues smoothly across timeline reloads
    static func sway(at date: Date) -> Double {
        sin((date.timeIntervalSince1970 / step).rounded(.down) / period * 2 * .pi)
    }

    func placeholder(in context: Context) -> Entry { Entry(date: .now, sway: 0, data: nil) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: .now, sway: Self.sway(at: .now), data: Store.data()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let data = Store.data()
        let first = Date(timeIntervalSince1970: (Date.now.timeIntervalSince1970 / Self.step).rounded(.down) * Self.step)
        let entries = (0..<Int(Self.period)).map { i -> Entry in
            let d = first.addingTimeInterval(Double(i) * Self.step)
            return Entry(date: d, sway: Self.sway(at: d), data: data)
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
    static let space = Color(hex: "05081a"), ocean = Color(hex: "112049"), land = Color(hex: "2a4580")
    static let visited = Color(hex: "e9b65c"), glow = Color(hex: "ffcf6e"), border = Color(hex: "cddaff").opacity(0.22)
    static let dot = Color(hex: "fff6dc"), air = Color(hex: "7fa6ff")
}

// ---------- 3D maths on the unit sphere ----------
struct V3 {
    var x, y, z: Double
    static func + (a: V3, b: V3) -> V3 { V3(x: a.x + b.x, y: a.y + b.y, z: a.z + b.z) }
    static func - (a: V3, b: V3) -> V3 { V3(x: a.x - b.x, y: a.y - b.y, z: a.z - b.z) }
    static func * (a: V3, k: Double) -> V3 { V3(x: a.x * k, y: a.y * k, z: a.z * k) }
    func dot(_ b: V3) -> Double { x * b.x + y * b.y + z * b.z }
    func cross(_ b: V3) -> V3 { V3(x: y * b.z - z * b.y, y: z * b.x - x * b.z, z: x * b.y - y * b.x) }
    var length: Double { sqrt(dot(self)) }
    var unit: V3 { self * (1 / max(length, 1e-12)) }
    init(x: Double, y: Double, z: Double) { self.x = x; self.y = y; self.z = z }
    init(lat: Double, lng: Double) {
        let φ = lat * .pi / 180, λ = lng * .pi / 180
        self.init(x: cos(φ) * cos(λ), y: cos(φ) * sin(λ), z: sin(φ))
    }
}

/// A pinhole camera above the globe, looking at the visited region at an angle so the horizon curves across the top
struct Camera {
    let pos: V3, right: V3, up: V3, fwd: V3
    let dist: Double
    var focal = 1.0, cx = 0.0, cy = 0.0

    /// Frame the given places: camera south of their centre (swaying east–west), high enough that the horizon shows
    init(places: [V3], sway: Double) {
        let centre = places.isEmpty ? V3(lat: 45, lng: 10) : places.reduce(V3(x: 0, y: 0, z: 0), +).unit
        let spread = places.map { acos(max(-1, min(1, $0.dot(centre)))) }.max() ?? 0.3   // radians
        let east = V3(x: 0, y: 0, z: 1).cross(centre).unit, north = centre.cross(east)
        let tilt = 0.42 + spread * 0.35                                  // how far "behind" the region we sit
        let az = sway * 0.45                                             // ± ~26° swing
        let back = (north * -cos(az) + east * sin(az)).unit
        let dir = (centre * cos(tilt) + back * sin(tilt)).unit
        // Horizon (seen from distance D it is acos(1/D) from straight down) a bit beyond the far side of the region
        let horizon = min(1.35, tilt + spread + 0.32)
        dist = 1 / cos(horizon)
        pos = dir * dist
        let target = centre * 1 + north * (spread * 0.35)                // look a little past the centre
        fwd = (target.unit - pos).unit
        right = fwd.cross(centre).unit
        up = right.cross(fwd)
    }

    /// Screen point, and whether the surface point faces the camera (lift: height above the surface, in radii)
    func project(_ p: V3, lift: Double = 0) -> (CGPoint, Bool) {
        let q = p * (1 + lift), v = q - pos
        let z = max(v.dot(fwd), 1e-6)
        let visible = q.dot(pos) > q.dot(q)
        return (CGPoint(x: cx + v.dot(right) / z * focal, y: cy - v.dot(up) / z * focal), visible)
    }

    /// Hidden points are moved to the horizon, so country outlines stay closed
    func clampToHorizon(_ p: V3) -> V3 {
        let c = pos.unit, h = 1 / dist, rho = sqrt(max(0, 1 - h * h))
        let inPlane = p - c * (p.dot(c) - h)
        return c * h + (inPlane - c * h).unit * rho
    }

    func horizon(_ n: Int = 160) -> [CGPoint] {
        let c = pos.unit, h = 1 / dist, rho = sqrt(max(0, 1 - h * h))
        let a = (abs(c.z) < 0.9 ? V3(x: 0, y: 0, z: 1) : V3(x: 1, y: 0, z: 0)).cross(c).unit, b = c.cross(a)
        return (0...n).map { i in
            let t = Double(i) / Double(n) * 2 * .pi
            return project(c * h + (a * cos(t) + b * sin(t)) * rho).0
        }
    }

    /// Choose zoom and centring so the places fill the lower part of the frame, horizon near the top
    mutating func fit(_ places: [V3], in size: CGSize, wide: Bool) {
        focal = 1; cx = 0; cy = 0
        let pts = places.map { project($0).0 }
        let xs = pts.map(\.x), ys = pts.map(\.y)
        let w = max((xs.max() ?? 0.1) - (xs.min() ?? -0.1), 0.05), hgt = max((ys.max() ?? 0.1) - (ys.min() ?? -0.1), 0.05)
        focal = min(size.width * (wide ? 0.55 : 0.62) / w, size.height * 0.42 / hgt, size.width * 2.2)
        cx = size.width / 2 - ((xs.max() ?? 0) + (xs.min() ?? 0)) / 2 * focal
        cy = size.height * 0.60 - ((ys.max() ?? 0) + (ys.min() ?? 0)) / 2 * focal
        // Keep the horizon in view: at most a sliver of space if the region is big
        if let top = horizon(40).map(\.y).min(), top < size.height * 0.06 { cy += size.height * 0.06 - top }
    }
}

/// Point a fraction t of the way along the great circle from a to b
func slerp(_ a: V3, _ b: V3, _ t: Double) -> V3 {
    let ω = acos(max(-1, min(1, a.dot(b))))
    if ω < 1e-6 { return a }
    return (a * (sin((1 - t) * ω) / sin(ω)) + b * (sin(t * ω) / sin(ω))).unit
}

enum Layout { case small, wide, large }

struct GlobeView: View {
    let entry: Entry
    var layout = Layout.small
    var wide: Bool { layout == .wide }

    var body: some View {
        let data = entry.data ?? WidgetData()
        let places = data.dots.filter { $0.count == 2 }.map { V3(lat: $0[0], lng: $0[1]) }
        ZStack(alignment: layout == .large ? .topLeading : .bottomLeading) {
            Canvas { ctx, size in
                var cam = Camera(places: places, sway: entry.sway)
                cam.fit(places.isEmpty ? [V3(lat: 50, lng: -5), V3(lat: 40, lng: 25)] : places, in: size, wide: wide)
                let rect = CGRect(origin: .zero, size: size)

                // Space with a few stars
                ctx.fill(Path(rect), with: .color(.space))
                var rng = SplitMix(seed: 7)
                for _ in 0..<40 {
                    let s = rng.next() * 1.2 + 0.3
                    ctx.fill(Path(ellipseIn: CGRect(x: rng.next() * size.width, y: rng.next() * size.height * 0.5, width: s, height: s)),
                             with: .color(.white.opacity(rng.next() * 0.5 + 0.15)))
                }

                // The Earth: silhouette from the horizon circle, with atmosphere glow along the limb
                var earth = Path(); earth.addLines(cam.horizon()); earth.closeSubpath()
                ctx.drawLayer { glow in
                    glow.addFilter(.blur(radius: size.width * 0.04))
                    glow.stroke(earth, with: .color(.air), lineWidth: size.width * 0.05)
                }
                ctx.stroke(earth, with: .color(Color(hex: "b9d0ff").opacity(0.8)), lineWidth: 1.2) // thin bright limb
                ctx.fill(earth, with: .linearGradient(Gradient(colors: [Color(hex: "1c3577"), .ocean, Color(hex: "0c173a")]),
                                                      startPoint: CGPoint(x: size.width * 0.7, y: 0), endPoint: CGPoint(x: size.width * 0.3, y: size.height)))
                ctx.clip(to: earth)

                // Countries (visited ones in gold, with a warm glow like city lights at night)
                let visited = Set(data.visited)
                var borders = Path(), gold = Path()
                for country in Store.world {
                    var shape = Path()
                    for ring in country.p {
                        let pts = ring.map { V3(lat: $0[1], lng: $0[0]) }
                        let proj = pts.map { cam.project($0) }
                        guard proj.contains(where: { $0.1 }) else { continue }
                        shape.addLines(zip(pts, proj).map { $0.1.1 ? $0.1.0 : cam.project(cam.clampToHorizon($0.0)).0 })
                        shape.closeSubpath()
                    }
                    if shape.isEmpty { continue }
                    let on = visited.contains(country.n)
                    ctx.fill(shape, with: .color(on ? .visited : .land))
                    if on { gold.addPath(shape) }
                    borders.addPath(shape)
                }
                ctx.drawLayer { glow in
                    glow.addFilter(.blur(radius: size.width * 0.025))
                    glow.fill(gold, with: .color(.glow.opacity(0.55)))
                }
                ctx.stroke(borders, with: .color(.border), lineWidth: 0.4)

                // Haze towards the horizon, like the atmosphere seen at an angle
                if let top = cam.horizon(40).map(\.y).min() {
                    ctx.fill(Path(rect), with: .linearGradient(Gradient(colors: [Color.air.opacity(0.35), .clear]),
                                                                startPoint: CGPoint(x: 0, y: top), endPoint: CGPoint(x: 0, y: top + size.height * 0.28)))
                }

                // Routes: great circles lifted in the middle, glowing
                var routes: [(Path, Color)] = []
                for (i, a) in data.arcs.enumerated() where a.count == 4 {
                    let from = V3(lat: a[0], lng: a[1]), to = V3(lat: a[2], lng: a[3])
                    let span = acos(max(-1, min(1, from.dot(to))))
                    var line = Path(), drawing = false
                    for s in 0...40 {
                        let t = Double(s) / 40
                        let (p, visible) = cam.project(slerp(from, to, t), lift: sin(.pi * t) * min(0.12, span * 0.12))
                        if visible { drawing ? line.addLine(to: p) : line.move(to: p); drawing = true } else { drawing = false }
                    }
                    routes.append((line, i < data.colors.count ? Color(hex: data.colors[i]) : .visited))
                }
                ctx.drawLayer { glow in
                    glow.addFilter(.blur(radius: 2.5))
                    for (line, color) in routes { glow.stroke(line, with: .color(color.opacity(0.8)), lineWidth: 3) }
                }
                for (line, color) in routes { ctx.stroke(line, with: .color(color), style: StrokeStyle(lineWidth: 1.2, lineCap: .round)) }

                // Places, like city lights
                for p in places {
                    let (q, visible) = cam.project(p)
                    guard visible else { continue }
                    ctx.fill(Path(ellipseIn: CGRect(x: q.x - 4, y: q.y - 4, width: 8, height: 8)), with: .color(.glow.opacity(0.25)))
                    ctx.fill(Path(ellipseIn: CGRect(x: q.x - 1.7, y: q.y - 1.7, width: 3.4, height: 3.4)), with: .color(.dot))
                }
            }
            caption(data)
        }
        .containerBackground(for: .widget) { Color.space }
    }

    @ViewBuilder func caption(_ data: WidgetData) -> some View {
        Group {
            if data.trips == 0 {
                Text("No trips yet").font(.system(size: 11, weight: .semibold, design: .rounded))
            } else if layout == .large {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(data.countries) countries").font(.system(size: 22, weight: .bold, design: .rounded))
                    Text("\(data.trips) trips · \(data.km.formatted()) km").font(.system(size: 13, weight: .medium, design: .rounded)).opacity(0.85)
                }
            } else {
                captionBody(data)
            }
        }
        .foregroundStyle(Color.dot).shadow(color: .black.opacity(0.6), radius: 3)
        .padding(layout == .small ? 10 : 14)
    }

    @ViewBuilder func captionBody(_ data: WidgetData) -> some View {
        if wide {
            VStack(alignment: .leading, spacing: 1) {
                Text("\(data.countries) countries").font(.system(size: 15, weight: .bold, design: .rounded))
                Text("\(data.trips) trips · \(data.km.formatted()) km").font(.system(size: 11, weight: .medium, design: .rounded)).opacity(0.85)
            }
            .foregroundStyle(Color.dot).shadow(color: .black.opacity(0.6), radius: 3)
        } else {
            Text("\(data.countries) countries · \(data.km.formatted()) km")
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.dot).shadow(color: .black.opacity(0.6), radius: 3)
        }
    }
}

/// Tiny deterministic random numbers, so the stars don't jump between pictures
struct SplitMix {
    var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> Double {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9; z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return Double((z ^ (z >> 31)) >> 11) / Double(1 << 53)
    }
}

struct WidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry
    var body: some View { GlobeView(entry: entry, layout: family == .systemMedium ? .wide : family == .systemLarge ? .large : .small) }
}

#if !PREVIEW // scripts can render GlobeView to an image with -DPREVIEW
@main
#endif
struct LittlePrinceWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LittlePrinceGlobe", provider: Provider()) { WidgetEntryView(entry: $0) }
            .configurationDisplayName("Travel globe")
            .description("The places you've been, seen from orbit.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
            .contentMarginsDisabled() // the picture runs edge to edge
    }
}

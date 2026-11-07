import Foundation
import VideoToolbox
import CoreMedia
import CoreVideo
import CoreImage
import ReplayKit

final class VideoEncoder {
    private var session: VTCompressionSession?
    private let context = CIContext(options: [.cacheIntermediates: false])
    private let queue = DispatchQueue(label: "geometry.cast.encoder")
    private let lock = NSLock()
    private var frames: [Data] = []
    private var lastTimestamp = CMTime.invalid
    private var width = 800, height = 480, fps = 20
    private var forceKeyframe = true
    private var recording = false
    var failed: (() -> Void)?
    func beginCapture() async throws {
        guard RPScreenRecorder.shared().isAvailable else { throw PanelError.unavailable("当前设备无法采集本应用画面。") }
        RPScreenRecorder.shared().isMicrophoneEnabled = false
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            RPScreenRecorder.shared().startCapture(handler: { [weak self] sample, kind, error in
                if error != nil { self?.failed?(); return }
                guard kind == .video else { return }; self?.feed(sample)
            }, completionHandler: { [weak self] error in
                if error != nil { continuation.resume(throwing: PanelError.unavailable("系统没有允许录制本应用画面。")) }
                else { self?.recording = true; continuation.resume() }
            })
        }
    }
    func configure(width: Int, height: Int, fps: Int, bitrate: Int) throws {
        guard (16...4096).contains(width), (16...4096).contains(height) else { throw PanelError.invalid("仪表分辨率不受支持。") }
        let factor = min(1.0, min(1920.0 / Double(width), 1080.0 / Double(height)))
        let finalWidth = max(16, Int(Double(width) * factor) / 16 * 16), finalHeight = max(16, Int(Double(height) * factor) / 16 * 16)
        try queue.sync {
            if let session { VTCompressionSessionInvalidate(session) }; session = nil
            self.width = finalWidth; self.height = finalHeight; self.fps = min(max(fps, 10), 30); self.lastTimestamp = .invalid
            let callback: VTCompressionOutputCallback = { reference, _, status, _, buffer in
                guard let reference, status == noErr, let buffer else { return }
                Unmanaged<VideoEncoder>.fromOpaque(reference).takeUnretainedValue().encoded(buffer)
            }
            var created: VTCompressionSession?
            guard VTCompressionSessionCreate(allocator: kCFAllocatorDefault, width: Int32(finalWidth), height: Int32(finalHeight), codecType: kCMVideoCodecType_H264,
                encoderSpecification: nil, imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: callback,
                refcon: Unmanaged.passUnretained(self).toOpaque(), compressionSessionOut: &created) == noErr, let created else { throw PanelError.unavailable("H.264 编码器初始化失败。") }
            self.session = created
            let properties: [CFString: Any] = [kVTCompressionPropertyKey_RealTime: true, kVTCompressionPropertyKey_AllowFrameReordering: false,
                kVTCompressionPropertyKey_ProfileLevel: kVTProfileLevel_H264_Baseline_AutoLevel, kVTCompressionPropertyKey_AverageBitRate: min(max(bitrate, 500000), 4000000),
                kVTCompressionPropertyKey_ExpectedFrameRate: self.fps, kVTCompressionPropertyKey_MaxKeyFrameInterval: self.fps]
            guard VTSessionSetProperties(created, propertyDictionary: properties as CFDictionary) == noErr, VTCompressionSessionPrepareToEncodeFrames(created) == noErr else { VTCompressionSessionInvalidate(created); session = nil; throw PanelError.unavailable("仪表视频编码设置不受支持。") }
            lock.lock(); frames.removeAll(); forceKeyframe = true; lock.unlock()
        }
    }
    var dimensions: (Int, Int) { queue.sync { (width, height) } }
    func stop() {
        if recording { recording = false; RPScreenRecorder.shared().stopCapture { _ in } }
        queue.sync { if let session { VTCompressionSessionInvalidate(session) }; session = nil }
        lock.lock(); frames.removeAll(); lock.unlock()
    }
    func pull() -> Data? {
        lock.lock(); defer { lock.unlock() }
        guard !frames.isEmpty else { forceKeyframe = true; return nil }; return frames.removeFirst()
    }
    private func feed(_ sample: CMSampleBuffer) {
        queue.async { [weak self] in
            guard let self, let session = self.session, let source = CMSampleBufferGetImageBuffer(sample) else { return }
            let timestamp = CMSampleBufferGetPresentationTimeStamp(sample)
            if self.lastTimestamp.isValid && CMTimeGetSeconds(timestamp - self.lastTimestamp) < 1 / Double(self.fps) { return }; self.lastTimestamp = timestamp
            var target: CVPixelBuffer?
            let attrs: [String: Any] = [kCVPixelBufferCGImageCompatibilityKey as String: true, kCVPixelBufferCGBitmapContextCompatibilityKey as String: true, kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
            guard CVPixelBufferCreate(kCFAllocatorDefault, self.width, self.height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &target) == kCVReturnSuccess, let target else { return }
            let image = CIImage(cvPixelBuffer: source), bounds = CGRect(x: 0, y: 0, width: CGFloat(self.width), height: CGFloat(self.height))
            let scale = min(CGFloat(self.width) / image.extent.width, CGFloat(self.height) / image.extent.height)
            let transformed = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale)).transformed(by: CGAffineTransform(translationX: (CGFloat(self.width) - image.extent.width * scale) / 2, y: (CGFloat(self.height) - image.extent.height * scale) / 2))
            let composed = transformed.composited(over: CIImage(color: .black).cropped(to: bounds)); self.context.render(composed, to: target, bounds: bounds, colorSpace: CGColorSpaceCreateDeviceRGB())
            self.lock.lock(); let force = self.forceKeyframe; self.forceKeyframe = false; self.lock.unlock()
            let options: CFDictionary? = force ? [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary : nil
            let result = VTCompressionSessionEncodeFrame(session, imageBuffer: target, presentationTimeStamp: timestamp, duration: CMTime(value: 1, timescale: Int32(self.fps)), frameProperties: options, sourceFrameRefcon: nil, infoFlagsOut: nil)
            if result != noErr { self.failed?() }
        }
    }
    private func encoded(_ sample: CMSampleBuffer) {
        guard CMSampleBufferDataIsReady(sample), let block = CMSampleBufferGetDataBuffer(sample), let format = CMSampleBufferGetFormatDescription(sample) else { return }
        let size = CMBlockBufferGetDataLength(block); guard size > 0, size <= 4 * 1024 * 1024 else { return }
        var avcc = Data(count: size)
        let result = avcc.withUnsafeMutableBytes { CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: size, destination: $0.baseAddress!) }
        guard result == kCMBlockBufferNoErr else { return }
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[CFString: Any]]
        let isKey = !(attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
        var annex = Data()
        if isKey {
            for index in 0..<2 {
                var pointer: UnsafePointer<UInt8>?, count = 0
                if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, parameterSetIndex: index, parameterSetPointerOut: &pointer, parameterSetSizeOut: &count, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr, let pointer, count > 0 { annex += Data([0,0,0,1]); annex += Data(bytes: pointer, count: count) }
            }
        }
        var offset = 0
        while offset + 4 <= avcc.count {
            guard let length = try? avcc.unsigned(offset, 4, little: false), length > 0, length <= avcc.count - offset - 4 else { return }
            offset += 4; annex += Data([0,0,0,1]); annex += avcc.subdata(in: offset..<(offset + Int(length))); offset += Int(length)
        }
        guard offset == avcc.count else { return }
        lock.lock(); if frames.count >= 4 { frames.removeFirst(); forceKeyframe = true }; frames.append(annex); lock.unlock()
    }
}

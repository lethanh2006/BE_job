/** Kiểm tra các phụ thuộc cần thiết để phục vụ request (cơ sở dữ liệu); ném lỗi nếu chưa sẵn sàng. */
export abstract class ReadinessProbe {
  abstract check(): Promise<void>;
}

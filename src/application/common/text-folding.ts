/**
 * Chuẩn hóa chuỗi để tìm kiếm không phân biệt hoa thường và dấu tiếng Việt
 * ("Hà Nội" khớp "ha noi"). Bản SQL tương ứng là hàm `vn_fold` trong migration 0002;
 * hai bản phải cho cùng kết quả (có test so khớp).
 */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Bỏ ký tự điều khiển (dùng làm dấu phân tách nội bộ trong cột tìm kiếm của database). */
export function stripControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex -- cố ý loại ký tự điều khiển
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ');
}

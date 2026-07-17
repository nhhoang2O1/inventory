# ADR-0003: Whole-case inventory quantity

- Status: Accepted by warehouse owner
- Date: 2026-07-17

## Decision

Base UOM của SKU là thùng/két/keg. Quantity là positive integer. Không có break-pack chai/lon/lốc. Minimum inbound/outbound quantity là policy theo SKU/supplier/channel và thời gian hiệu lực.

## Consequences

- Database dùng integer/bigint cho quantity.
- API từ chối decimal và retail unit.
- Packaging specification chỉ phục vụ báo cáo/hóa đơn/thuế.
- Ngoại lệ nhận phần còn lại hoặc return phải có policy, quyền, lý do và audit; không có ngoại lệ bán lẻ.

import { groupMeta, type GroupDef } from '../../groups';

interface GroupPickerProps {
  groups: GroupDef[];
  value: string;
  onChange: (id: string) => void;
}

/** Lưới chọn một nhóm (dùng cho phần "Khi" của quy tắc ở mọi cấp) */
export default function GroupPicker({ groups, value, onChange }: GroupPickerProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {groups.map((g) => {
        const meta = groupMeta(g);
        const active = g.id === value;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            aria-pressed={active}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
              active ? 'border-primary bg-primary-soft' : 'border-line hover:bg-canvas'
            }`}
          >
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
              <meta.icon className="size-4" />
            </span>
            <span className={`font-medium ${active ? 'text-primary' : ''}`}>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

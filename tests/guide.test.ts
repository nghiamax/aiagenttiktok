import { describe, expect, it } from 'vitest';
import { GUIDE_SECTIONS, parseGuideVideo } from '../src/config/guide';

/* Video hướng dẫn: nhận link YouTube / file video, link lạ hoặc trống → không nhúng */
describe('parseGuideVideo', () => {
  const embed = (id: string) => ({ kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` });

  it('nhận các dạng link YouTube', () => {
    expect(parseGuideVideo('https://www.youtube.com/watch?v=2kXtUnsjuVw')).toEqual(embed('2kXtUnsjuVw'));
    expect(parseGuideVideo('https://www.youtube.com/watch?list=x&v=2kXtUnsjuVw&t=10')).toEqual(embed('2kXtUnsjuVw'));
    expect(parseGuideVideo('https://youtu.be/2kXtUnsjuVw?si=abc')).toEqual(embed('2kXtUnsjuVw'));
    expect(parseGuideVideo('https://www.youtube.com/shorts/2kXtUnsjuVw')).toEqual(embed('2kXtUnsjuVw'));
    expect(parseGuideVideo('https://www.youtube.com/embed/2kXtUnsjuVw')).toEqual(embed('2kXtUnsjuVw'));
  });

  it('file video .mp4 / .webm', () => {
    expect(parseGuideVideo('/huong-dan.mp4')).toEqual({ kind: 'file', src: '/huong-dan.mp4' });
    expect(parseGuideVideo('https://cdn.example.com/a.webm?v=2')).toEqual({ kind: 'file', src: 'https://cdn.example.com/a.webm?v=2' });
  });

  it('trống / link lạ → null (hiện "đang được cập nhật")', () => {
    expect(parseGuideVideo('')).toBeNull();
    expect(parseGuideVideo('   ')).toBeNull();
    expect(parseGuideVideo('https://example.com/trang')).toBeNull();
  });

  it('các phần hướng dẫn có id khác nhau', () => {
    const ids = GUIDE_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

# Subtitle Translator Pro

Tool Python có GUI để dịch subtitle `.srt` từ tiếng Trung sang tiếng Việt, giữ nguyên:
- timecode
- index
- định dạng SRT

Ngoài ra còn có:
- kéo thả file/folder `.srt`
- dịch cả folder subtitle
- batch translation
- chạy song song nhiều batch để tăng tốc rõ rệt

## Cài đặt

```bash
pip install -r requirements.txt
```

## requirements.txt

```txt
openai>=1.0.0
srt>=3.5.3
python-dotenv>=1.0.0
tkinterdnd2>=0.4.2
```

> `tkinterdnd2` dùng cho kéo thả. Nếu không cài được, app vẫn chạy, chỉ mất tính năng drag & drop.

## Cách dùng

### 1) Thiết lập API key
Có 2 cách:

- nhập trực tiếp trong GUI
- hoặc tạo file `.env`

```env
OPENAI_API_KEY=your_api_key_here
```

### 2) Chạy app

```bash
python subtitle_translator_pro.py
```

### 3) Trong app
- bấm **Thêm file .srt** hoặc **Thêm folder**
- hoặc kéo thả file/folder vào danh sách
- chọn **Output folder**
- bấm **Bắt đầu dịch**

## Gợi ý cấu hình
- Model: `gpt-5-mini`
- Batch size: `40`
- Workers: `6`

Nếu máy và mạng ổn:
- tăng `Batch size` lên `60`
- tăng `Workers` lên `8`

## Cách tăng tốc
App này tăng tốc bằng 2 cách:
1. Gộp nhiều subtitle thành 1 batch
2. Dịch song song nhiều batch bằng `ThreadPoolExecutor`

Với file dài, tốc độ thực tế thường nhanh hơn kiểu dịch từng dòng rất nhiều.

## Lưu ý
- App giữ nguyên timecode, chỉ thay nội dung subtitle
- output sẽ có hậu tố `_vi`, ví dụ:
  - `movie.srt` -> `movie_vi.srt`

## Đóng gói EXE
Nếu muốn chạy như app Windows:

```bash
pip install pyinstaller
pyinstaller --noconfirm --onefile --windowed subtitle_translator_pro.py
```


# Build EXE cho Windows

Mình không thể tạo trực tiếp file `.exe` chạy Windows từ môi trường hiện tại, vì PyInstaller không phải cross-compiler: để tạo app Windows, bạn cần chạy PyInstaller trên Windows. Theo tài liệu PyInstaller, muốn tạo Windows app thì chạy PyInstaller trên Windows; muốn tạo Linux app thì chạy trên Linux.

## Cách nhanh nhất trên máy Windows

### 1. Cài Python 3.11+
Khi cài, nhớ tick **Add Python to PATH**.

### 2. Giải nén project
Mở thư mục `subtitle_translator_pro`.

### 3. Build
Chạy file:
- `build_windows.bat`
hoặc
- `build_windows.ps1`

Sau khi build xong, file exe sẽ nằm ở:

```text
dist/SubtitleTranslatorPro.exe
```

## Build tự động bằng GitHub Actions

Project đã kèm workflow:

```text
.github/workflows/build-windows.yml
```

Chỉ cần:
1. Upload code lên GitHub
2. Vào tab **Actions**
3. Chạy workflow **Build Windows EXE**
4. Tải artifact `SubtitleTranslatorPro-windows`

## Package đã kèm
- `SubtitleTranslatorPro.spec`
- `build_windows.bat`
- `build_windows.ps1`
- `.github/workflows/build-windows.yml`

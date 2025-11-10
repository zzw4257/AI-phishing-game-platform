import requests
import time
import json
import os
from pathlib import Path
from PIL import Image
from io import BytesIO

# --- 任务配置 ---

# 基础输出目录
OUTPUT_BASE_DIR = Path("./public/assets/info-battle/")

# 图片生成任务列表
# 每个任务包含:
#   - output_path: 相对基础目录的输出路径 (会自动添加 .webp 后缀)
#   - prompt: 用于生成图像的详细英文 prompt
IMAGE_GENERATION_TASKS = [
    {
        "output_path": "hero/hero_city",
        "prompt": "A sprawling cyberpunk city at night, bathed in neon blues and purples. Holographic ads flicker on towering skyscrapers. Below, light trails from flying vehicles weave through urban canyons. The atmosphere is tense, with a subtle overlay of digital code and data streams, suggesting an invisible information war. Semi-realistic illustration style, cool color palette, cinematic lighting."
    },
    {
        "output_path": "scenarios/health-subsidy/intro",
        "prompt": "A futuristic, sterile hospital laboratory. A patient is undergoing a data scan, with holographic displays showing vital signs and genetic information. Medical droids and scientists in high-tech gear are in the background, collecting data. Cool, clinical lighting with blue and white tones. Semi-realistic illustration, emphasis on screen elements."
    },
    {
        "output_path": "scenarios/health-subsidy/phishing",
        "prompt": "Close-up on a futuristic tablet screen displaying a phishing email. The email falsely offers a 'CyberHealth Subsidy' with a large, tempting red envelope icon that says 'Claim Now!'. The design is slightly off, with suspicious logos and urgent language. The background is a dim, personal apartment. Emphasize the glowing screen. Semi-realistic illustration, cool tones."
    },
    {
        "output_path": "scenarios/health-subsidy/leader",
        "prompt": "A government official's desk with a high-tech terminal displaying an official public health announcement. A prominent, chrome government emblem is visible on the screen. The notice is formal and uses a clean, official font. The scene is serious and authoritative, set in a modern government office. Cool tones, semi-realistic illustration."
    },
    {
        "output_path": "scenarios/facial-database/intro",
        "prompt": "A wide-angle view of a futuristic city square under constant surveillance. Multiple CCTV cameras with glowing red lenses are visible. Pedestrians' faces are highlighted with digital recognition boxes and data points on a holographic overlay. The atmosphere is cold and slightly dystopian. Semi-realistic illustration, cool color palette."
    },
    {
        "output_path": "scenarios/facial-database/phishing",
        "prompt": "A person's hand holding a smartphone. The screen shows a QR code with text 'Scan to Win a Prize!'. A large, red, semi-transparent phishing alert warning is overlaid on the screen, indicating a security threat. The background is a busy, neon-lit street. Focus on the screen interaction. Semi-realistic illustration."
    },
    {
        "output_path": "scenarios/epidemic-tracing/intro",
        "prompt": "An epidemic command center with a massive holographic world map at its center. The map shows glowing red dots and spreading infection vectors. Data streams and charts are projected in the air. People in uniforms are working at their terminals. High-tech, tense atmosphere. Semi-realistic illustration, cool tones."
    },
    {
        "output_path": "scenarios/epidemic-tracing/phishing",
        "prompt": "A close-up of a futuristic smartphone UI displaying a fake SMS message. The message urgently offers a reward for completing a health survey, with a suspicious-looking link. The UI design is sleek but uses alarmist colors like red and yellow. Semi-realistic illustration with a focus on the user interface."
    },
    {
        "output_path": "roles/phisher_panel",
        "prompt": "A hacker in a dark room, only their silhouette and hands are visible, typing on a glowing keyboard. Multiple screens in front of them show scrolling code, social engineering profiles, and network maps. The hacker's identity is concealed, creating a sense of anonymity and threat. Semi-realistic illustration, cyber-noir style."
    },
    {
        "output_path": "roles/leader_panel",
        "prompt": "An official government press conference in a modern, minimalist room. A leader stands at a high-tech podium with a digital government seal. Large screens in the background display official data and charts. The atmosphere is formal, authoritative, and controlled. Semi-realistic illustration, cool and professional color scheme."
    },
    {
        "output_path": "roles/citizen_panel",
        "prompt": "A concerned citizen sitting in front of their home computer terminal in a slightly cluttered, cozy room. They are carefully analyzing a suspicious email on the screen, with a thoughtful and cautious expression. The screen's light illuminates their face. Semi-realistic illustration, emphasizing the human element in the digital world."
    }
]

# --- API 配置 ---

base_url = 'https://api-inference.modelscope.cn/'
# 即使有多个，也只会使用第一个
working_api_keys = ['ms-a0d32790-a38e-4691-8403-62ec60bf52ba']

def get_headers(api_key):
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

def generate_single_image(task_info, api_key, max_retries=3):
    """
    根据任务信息生成单张图像，并转换为 WebP 格式。
    """
    prompt = task_info["prompt"]
    output_path_jpg = OUTPUT_BASE_DIR / f"{task_info['output_path']}.jpg"
    output_path_webp = OUTPUT_BASE_DIR / f"{task_info['output_path']}.webp"
    
    output_path_webp.parent.mkdir(parents=True, exist_ok=True)
    
    print(f"处理任务: {output_path_webp.name}")

    for attempt in range(max_retries):
        try:
            # 1. 提交异步生成任务
            response = requests.post(
                f"{base_url}v1/images/generations",
                headers={**get_headers(api_key), "X-ModelScope-Async-Mode": "true"},
                data=json.dumps({
                    "model": "Qwen/Qwen-Image",
                    "prompt": prompt,
                    "size": "1328x1328",
                    "seed": 42,
                    "guidance": 4.0,
                    "steps": 30
                }, ensure_ascii=False).encode('utf-8')
            )
            response.raise_for_status()
            task_id = response.json()["task_id"]

            # 2. 轮询任务结果
            max_wait_time = 300
            wait_time = 0
            while wait_time < max_wait_time:
                result = requests.get(
                    f"{base_url}v1/tasks/{task_id}",
                    headers={**get_headers(api_key), "X-ModelScope-Task-Type": "image_generation"},
                )
                result.raise_for_status()
                data = result.json()

                if data["task_status"] == "SUCCEED":
                    # 3. 下载并保存为 JPG
                    image_url = data["output_images"][0]
                    image_content = requests.get(image_url).content
                    image = Image.open(BytesIO(image_content))
                    
                    if image.mode != 'RGB':
                        image = image.convert('RGB')
                        
                    image.save(output_path_jpg, "JPEG")
                    print(f"临时 JPG 已保存: {output_path_jpg.name}")

                    # 4. 转换为 WebP 并删除 JPG
                    image.save(output_path_webp, "WEBP", quality=85)
                    print(f"✅ 成功转换为 WebP: {output_path_webp.name}")
                    
                    try:
                        os.remove(output_path_jpg)
                    except OSError as e:
                        print(f"删除临时 JPG 失败: {e}")
                        
                    return True

                elif data["task_status"] == "FAILED":
                    print(f"❌ 任务失败: {output_path_webp.name} - 原因: {data.get('message', '未知错误')}")
                    break

                time.sleep(10)
                wait_time += 10
            
            if wait_time >= max_wait_time:
                print(f"⏰ 任务超时: {output_path_webp.name}")

        except requests.exceptions.RequestException as e:
            print(f"请求失败: {e}")
            if attempt < max_retries - 1:
                wait_seconds = (attempt + 1) * 5
                print(f"将在 {wait_seconds} 秒后重试... ({attempt + 2}/{max_retries})")
                time.sleep(wait_seconds)
            else:
                print(f"❌ 已达到最大重试次数: {output_path_webp.name}")
                break
        except Exception as e:
            print(f"发生未知错误: {e}")
            break
            
    return False

def main():
    """主函数：顺序生成所有定义的图像任务"""
    print(f"--- 开始图片批量生成任务 (顺序执行) ---")
    
    if not working_api_keys:
        print("❌ 错误: API key 列表为空，无法执行任务。")
        return

    api_key_to_use = working_api_keys[0]
    total_tasks = len(IMAGE_GENERATION_TASKS)

    print(f"总计 {total_tasks} 张图片需要生成。")
    print(f"输出目录: {OUTPUT_BASE_DIR.resolve()}")
    print(f"将使用单个 API Key: {api_key_to_use[:12]}... 进行顺序处理。")
    
    success_count = 0
    # 按顺序迭代并执行每个任务
    for i, task in enumerate(IMAGE_GENERATION_TASKS, 1):
        print(f"\n--- ==> 开始任务 {i}/{total_tasks} <== ---")
        if generate_single_image(task, api_key_to_use):
            success_count += 1
        print(f"--- ==> 任务 {i}/{total_tasks} 处理结束 <== ---")

    print("\n--- 批量生成任务完成 ---")
    fail_count = total_tasks - success_count
    success_rate = (success_count / total_tasks * 100) if total_tasks > 0 else 0
    
    print(f"成功: {success_count}/{total_tasks} 张图片")
    print(f"失败: {fail_count} 张图片")
    print(f"成功率: {success_rate:.1f}%")
    print(f"所有 WebP 图片已保存在目录: {OUTPUT_BASE_DIR.resolve()}")

if __name__ == "__main__":
    main()
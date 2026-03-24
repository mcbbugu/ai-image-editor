const API_KEY = import.meta.env.VITE_DASHSCOPE_API_KEY

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 413) throw new Error('图片太大，已自动压缩仍超限，请换更小的图')
    throw new Error(text.slice(0, 200) || res.statusText)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(text.slice(0, 120) || '响应不是 JSON')
  }
}

export async function recognizeRegion(cropDataUrl: string): Promise<string> {
  const res = await fetch('/api/dashscope/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen-vl-plus',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: cropDataUrl } },
            { type: 'text', text: '请简短描述图片中的内容，10字以内。' },
          ],
        },
      ],
    }),
  })
  const data = await readJson<{ choices?: { message?: { content?: string } }[] }>(res)
  return data.choices?.[0]?.message?.content ?? '未识别'
}

async function submitEditTask(
  imageBase64: string | undefined,
  imageUrl: string | undefined,
  maskBase64: string,
  prompt: string,
  baseMime: string
): Promise<string> {
  const input = {
    function: 'description_edit_with_mask',
    prompt,
    base_image_url: imageUrl ?? `data:${baseMime};base64,${imageBase64}`,
    mask_image_url: `data:image/png;base64,${maskBase64}`,
  }

  const res = await fetch(
    '/api/dashscope/api/v1/services/aigc/image2image/image-synthesis',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'wanx2.1-imageedit',
        input,
        parameters: { n: 1 },
      }),
    }
  )
  const data = await readJson<{ output?: { task_id?: string }; message?: string }>(res)
  if (!data.output?.task_id) throw new Error(data.message ?? JSON.stringify(data))
  return data.output.task_id
}

async function pollTask(taskId: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(
      `/api/dashscope/api/v1/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    )
    const data = await readJson<{
      output?: { task_status?: string; message?: string; results?: { url: string }[] }
    }>(res)
    const status = data.output?.task_status
    if (status === 'SUCCEEDED') {
      const u = data.output?.results?.[0]?.url
      if (u) return u
      throw new Error('未返回结果')
    }
    if (status === 'FAILED') throw new Error(data.output?.message ?? '图像编辑失败')
  }
  throw new Error('超时，请重试')
}

export async function editImage(
  imageBase64: string | undefined,
  imageUrl: string | undefined,
  maskBase64: string,
  prompt: string,
  baseMime = 'image/png'
): Promise<string> {
  const taskId = await submitEditTask(imageBase64, imageUrl, maskBase64, prompt, baseMime)
  return pollTask(taskId)
}

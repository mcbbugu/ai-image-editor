const API_KEY = import.meta.env.VITE_DASHSCOPE_API_KEY

export async function recognizeRegion(croppedBase64: string): Promise<string> {
  const res = await fetch('/dashscope/compatible-mode/v1/chat/completions', {
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
            { type: 'image_url', image_url: { url: `data:image/png;base64,${croppedBase64}` } },
            { type: 'text', text: '请简短描述图片中的内容，10字以内。' },
          ],
        },
      ],
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? '未识别'
}

async function submitEditTask(imageBase64: string, maskBase64: string, prompt: string): Promise<string> {
  const res = await fetch(
    '/dashscope/api/v1/services/aigc/image2image/image-synthesis',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: 'wanx2.1-imageedit',
        input: {
          function: 'description_edit_with_mask',
          prompt,
          base_image_url: `data:image/png;base64,${imageBase64}`,
          mask_image_url: `data:image/png;base64,${maskBase64}`,
        },
        parameters: { n: 1 },
      }),
    }
  )
  const data = await res.json()
  if (!data.output?.task_id) throw new Error(data.message ?? JSON.stringify(data))
  return data.output.task_id
}

async function pollTask(taskId: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await fetch(
      `/dashscope/api/v1/tasks/${taskId}`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    )
    const data = await res.json()
    const status = data.output?.task_status
    if (status === 'SUCCEEDED') return data.output.results[0].url
    if (status === 'FAILED') throw new Error(data.output?.message ?? '图像编辑失败')
  }
  throw new Error('超时，请重试')
}

export async function editImage(imageBase64: string, maskBase64: string, prompt: string): Promise<string> {
  const taskId = await submitEditTask(imageBase64, maskBase64, prompt)
  return pollTask(taskId)
}

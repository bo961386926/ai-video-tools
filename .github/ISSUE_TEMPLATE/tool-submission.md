---
name: 新工具提交
description: 提交一个新的 AI 视频创作工具
title: "[工具提交] 工具名称"
labels: ["tool-submission"]
body:
  - type: markdown
    attributes:
      value: |
        免费收录，无付费排名。请尽量填写完整，信息不全可能无法通过审核。
  - type: input
    id: name
    attributes:
      label: 工具名称
      placeholder: 例如：可灵 AI
    validations:
      required: true
  - type: input
    id: website
    attributes:
      label: 官网链接
      placeholder: https://example.com
    validations:
      required: true
  - type: textarea
    id: tagline
    attributes:
      label: 一句话简介
      description: 它在视频创作流程中解决什么问题（30 字以内）
    validations:
      required: true
  - type: dropdown
    id: category
    attributes:
      label: 所属分类
      options:
        - text-to-video 文生视频
        - ai-editing AI 剪辑
        - digital-human 数字人口播
        - translation-dubbing 翻译与配音
        - asset-generation 素材生成
        - video-enhance 增强与修复
    validations:
      required: true
  - type: dropdown
    id: pricing
    attributes:
      label: 定价模式
      options:
        - free 免费
        - freemium 免费+付费
        - paid 付费
        - trial 限时试用
    validations:
      required: true
  - type: dropdown
    id: access
    attributes:
      label: 国内访问
      options:
        - direct 可直接访问
        - proxy 需要特殊网络环境
        - unknown 不确定
  - type: input
    id: tags
    attributes:
      label: 标签
      description: 用逗号分隔 2-4 个，例如：文生视频, 国产, 视频续写
  - type: textarea
    id: extra
    attributes:
      label: 补充说明（选填）
      description: 例如开发者身份、特色功能

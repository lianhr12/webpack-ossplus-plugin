# webpack-ossplus-plugin
[![npm](https://img.shields.io/npm/v/webpack-ossplus-plugin.svg)](https://www.npmjs.com/package/webpack-ossplus-plugin)
[![LICENSE MIT](https://img.shields.io/npm/l/webpack-ossplus-plugin.svg)](https://www.npmjs.com/package/webpack-ossplus-plugin) 

> webpack OSS上传插件, 可在 webpack 打包结束后将来 webpack 生成的文件自动上传到 OSS 中，目前支持阿里云、腾讯云、七牛云服务提供商

## 安装使用
使用npm或者yarn快速安装
```bash
npm install webpack-ossplus-plugin -S
# or yarn
yarn add webpack-ossplus-plugin -S
```

根据模块使用，下面简单举例：

```javascript
// webpack.config.js
import { WebpackOSSPlusPlugin } from 'webpack-ossplus-plugin';
module.exports = {
  ...
  plugins: [
    ...
    new WebpackOSSPlusPlugin({
      provider: {
        // 阿里云OSS 配置信息
        aliOSS: {
          accessKeyId: 'xxx', // 在阿里 OSS 控制台获取
          accessKeySecret: 'xx', // 在阿里 OSS 控制台获取
          region: 'oss-cn-beijing', // OSS 服务节点, 示例: oss-cn-hangzhou
          bucket: 'xx', // OSS 存储空间, 在阿里 OSS 控制台获取
        },
        // 腾讯云OSS 配置
        // qcloudOS: {
        //   SecretId: 'xxx',
        //   SecretKey: 'xxx',
        //   Region: 'ap-guangzhou',
        //   Bucket: 'xx',
        // }
      },
      ossBaseDir: CDN_PATH, // 一级目录
      project: CDN_RESOURCE_PATH, // 二级目录，项目名(用于存放文件的直接目录)
      removeMode: false, // 上传完成后是否删除源文件，默认为true
      enableLog: false,  // 是否打开debug日志信息
      include: /(static).*?/  // 配置资源路径包含static，不填默认全部非.html文件
    })
  ]
}
```

## API文档
详细API文档内容，后续补充
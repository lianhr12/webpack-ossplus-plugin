import path from 'path';
import chalk from 'chalk';
import { mergeWith, cloneDeep, isPlainObject, merge, map } from 'lodash';
import AliOSS from 'ali-oss';
import COS from 'cos-nodejs-sdk-v5';
import qiniu from 'qiniu';
import { Buffer } from 'buffer';
import zlib from 'zlib';
import { Compilation, Compiler } from 'webpack';

export interface QcouldOSSOptions {
  /**
   * OSS 访问 key
   */
  SecretId?: string;
  /**
  * OSS 访问 secret
  */
  SecretKey?: string;
  /**
  * OSS 存储空间
  */
  Bucket?: string;
  /**
  * OSS 服务节点, eg: ap-guangzhou
  *
  */
  Region?: string;
  options?: {
    headers?: any
  };
}
export interface AliOSSOptions {
  /**
   * OSS 访问 key
   */
  accessKeyId?: string;
  /**
  * OSS 访问 secret
  */
  accessKeySecret?: string;
  /**
  * OSS 存储空间
  */
  bucket?: string;
  /**
  * OSS 服务节点, eg: oss-cn-hangzhou
  *
  */
  region?: string;
  /**
  * 可用于设置文件的请求头、超时时间等
  *
  * 参考: https://github.com/ali-sdk/ali-oss#putname-file-options
  *
  * 默认值: undefined
  */
  options?: {
    headers?: any
  };
}
export interface QiniuOSSOptions {
  /**
   * Access Key
   */
  accessKey?: string;
  /**
   * Secret Key
   */
  secretKey?: string;
  /**
  * OSS 存储空间
  */
  bucket?: string;
}

export interface WebpackOSSPlusPluginOptions {
  // 提供商信息
  provider: {
    /**
     * 阿里 oss 认证相关信息, 全部支持环境变量
     */
    aliOSS?: AliOSSOptions;
    qcloudOS?: QcouldOSSOptions;
    // 支持七牛云OSS
    qiniuOSS?: QiniuOSSOptions;
  };
  /**
   * 要排除的文件, 符合该正则表达式的文件不会上传
   *
   * 默认值: /.*\.html$/
   */
  exclude?: RegExp;

  /**
   * 要b包含的文件, 符合该正则表达式的文件要上传
   *
   * 默认值: /.*\.html$/
   */
  include?: RegExp,
  /**
   * 是否开启调试日志
   *
   * 默认不开启 (false)
   *
   */
  enableLog?: boolean;
  /**
   * 上传过程中出现错误是否忽略该错误继续 webpack 构建
   *
   * 默认不忽略 (false)
   *
   */
  ignoreError?: boolean;
  /**
   * 生成的文件自动上传至 OSS 后, 是否删除本地的对应文件
   *
   * 默认删除 (true)
   *
   */
  removeMode?: boolean;
  /**
   * OSS 中存放上传文件的目录名 (文件最终会上传至 `${ossBaseDir}/${project}` 目录下)
   *
   * 默认值: 'auto_upload_ci'
   *
   */
  ossBaseDir: string;
  /**
   * 项目名 (文件最终会上传至 `${ossBaseDir}/${project}` 目录下)
   *
   * 默认值: package.json 中的 name 值
   */
  project: string;
  /**
   * 上传失败时的重试次数
   *
   * 默认值: 3
   */
  retry: number;
  /**
   * 上传前是否检测该文件名是否已经存在
   *
   * true: 先检测同名文件是否已存在, 已存在则不上传, 否则上传
   * false: 直接上传访文件, 如已存在则覆盖
   *
   * 默认值: true 代表会检测
   */
  existCheck?: boolean;
  /**
   * 是否先进行 gzip 压缩后再上传
   *
   * 默认值: true
   */
  gzip?: boolean;

}

interface CompilerExt extends Compiler {
  plugin: (name: string, fn: (compilation: Compilation, cb: any) => void) => void;
}

const defaultConfig: WebpackOSSPlusPluginOptions = {
  provider: {},
  retry: 3, // 重试次数: number(>=0)
  existCheck: true, // true: 直接上传、false: 先检测,若已存在则不重新上传(不报错)
  // prefix 或者 ossBaseDir + project 二选一
  ossBaseDir: 'auto_upload_ci',
  project: '',
  exclude: /.*\.html$/,
  include: /.*/,
  enableLog: false,
  ignoreError: false,
  removeMode: true,
  gzip: true,
}

const red = chalk.red
const green = chalk.bold.green;
const yellow = chalk.yellow;

enum ProviderType {
  AliOSS = 0, // 阿里云OSS
  QCloudOSS = 1, // 腾讯云OSS
  QiniuOSS = 2 // 七牛云OSS
}

interface IFileInfo {
  name: string;
  path: string;
  content: string;
  $retryTime: number;
}

export class WebpackOSSPlusPlugin {
  config = defaultConfig; // 配置参数
  client = {} as AliOSS & COS; // 阿里云OSS客户端
  finalPrefix = ""; // 最终计算出来的prefix路径
  currentProvider = {} as AliOSSOptions & QcouldOSSOptions & QiniuOSSOptions; // 当前提供服务商信息
  providerType;

  constructor(config: WebpackOSSPlusPluginOptions) {
    // 合并配置信息
    this.config = mergeWith(
      cloneDeep(this.config),
      config || {},
      (objVal, srcVal) => {
        if (isPlainObject(objVal) && isPlainObject(srcVal)) {
          return merge(objVal, srcVal)
        } else {
          return srcVal
        }
      }
    );

    const { retry, provider, ossBaseDir, project } = this.config;
    // 容错处理
    if (typeof retry !== 'number' || retry < 0) {
      this.config.retry = 0;
    }

    // 上传OSS的最终路径
    this.finalPrefix = `${ossBaseDir}/${project}`;

    this.debug('默认配置:', defaultConfig)
    this.debug('项目配置:', config)
    this.debug('最终使用的配置:', this.config)

    if (typeof provider.aliOSS !== 'undefined') {
      this.currentProvider = provider.aliOSS;
      this.providerType = ProviderType.AliOSS;
      const { accessKeyId, accessKeySecret, bucket, region } = provider.aliOSS;
      this.client = AliOSS({
        accessKeyId,
        accessKeySecret,
        bucket,
        region
      });
    } else if (typeof provider.qcloudOS !== 'undefined') {
      this.currentProvider = provider.qcloudOS;
      this.providerType = ProviderType.QCloudOSS;
      const { SecretId, SecretKey } = provider.qcloudOS;
      this.client = new COS({
        SecretId,
        SecretKey
      });
    } else if (typeof provider.qiniuOSS !== 'undefined') {
      this.currentProvider = provider.qiniuOSS;
      this.providerType = ProviderType.QiniuOSS;
      const { accessKey, secretKey, bucket } = provider.qiniuOSS;
      const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
      const options = {
        scope: bucket,
      };
      const putPolicy = new qiniu.rs.PutPolicy(options);
      var uploadToken = putPolicy.uploadToken(mac);

      let config = new qiniu.conf.Config() as any;
      config.zone = qiniu.zone.Zone_z2;

      const formUploader = new qiniu.form_up.FormUploader(config);
      const putExtra = new qiniu.form_up.PutExtra();

      const bucketManager = new qiniu.rs.BucketManager(mac, config);
      this.client = {
        qiniuToken: uploadToken,
        bucketManager,
        formUploader,
        putExtra
      }
    }
  }

  apply(compiler: CompilerExt) {
    if (compiler.hooks && compiler.hooks.emit) {
      // webpack 5
      compiler.hooks.emit.tapAsync('WebpackOSSPlusPlugin', (compilation: Compilation, cb) => {
        this.pluginEmitFn(compilation, cb);
      });
    } else {
      if (typeof compiler.plugin === 'undefined') return;
      compiler.plugin('emit', (compilation: Compilation, cb) => {
        this.pluginEmitFn(compilation, cb);
      });
    }
  }

  pickupAssetsFile(compilation: Compilation): IFileInfo[] | undefined {
    const matched = {};
    const keys = Object.keys(compilation.assets);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // 排除不符合要求的文件
      if (this.config.exclude?.test(key)) {
        continue;
      }

      // 查找符合条件的文件
      if (this.config.include?.test(key)) {
        matched[key] = compilation.assets[key];
      }
    }

    return map(matched, (value, name) => ({
      name,
      path: value.existsAt ? value.existsAt : name,
      content: value.source()
    }));
  }

  pluginEmitFn(compilation: Compilation, cb) {
    const files = this.pickupAssetsFile(compilation);
    if (!files) {
      warn(`${yellow('\n 没有找到符合条件的文件上传，请检测配置信息！')}`);
      return;
    }
    log(`${green('\nOSS 上传开始......')}`)
    this.batchUploadFiles(files, compilation)
      .then(() => {
        log(`${green('OSS 上传完成\n')}`)
        cb()
      })
      .catch((err) => {
        log(`${red('OSS 上传出错')}::: ${red(err.code)}-${red(err.name)}: ${red(err.message)}`)
        this.config.ignoreError || compilation.errors.push(err)
        cb()
      });
  }

  checkOSSFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string) {
    // 检测OSS是否存在该文件处理
    if (this.providerType === ProviderType.AliOSS) {
      return this.aliCheckOSSFile(file, idx, files, compilation, uploadName);
    }

    if (this.providerType === ProviderType.QCloudOSS) {
      return this.qcloudCheckOSSFile(file, idx, files, compilation, uploadName);
    }

    // 七牛云
    if (this.providerType === ProviderType.QiniuOSS) {
      return this.qiniuCheckOSSFile(file, idx, files, compilation, uploadName);
    }

    return Promise.reject('检测OSS文件失败！');
  }

  aliCheckOSSFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string) {
    return new Promise((resolve, reject) => {
      this.client.list({
        prefix: uploadName,
        'max-keys': 50
      }).then((res) => {
        const arr = (res.objects || []).filter(item => item.name === uploadName)
        if (arr && arr.length > 0) {
          const timeStr = getTimeStr(new Date(res.objects[0].lastModified))
          log(`${green('已存在,免上传')} (上传于 ${timeStr}) ${idx}/${files.length}: ${uploadName}`)
          this.config.removeMode && delete compilation.assets[file.name]
          resolve(res);
        } else {
          throw new Error('not exist & need upload')
        }
      }).catch((err) => {
        // 如果获取失败，则处理文件上传
        this.uploadFile(file, idx, files, compilation, uploadName)
          .then((uRes) => {
            resolve(uRes);
          }).catch((uErr) => {
            reject(uErr);
          })
      })
    });
  }
  qcloudCheckOSSFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string) {
    return new Promise((resolve, reject) => {
      this.client.headObject({
        Bucket: this.currentProvider.Bucket,
        Region: this.currentProvider.Region,
        key: uploadName
      }, (err, result) => {
        if (result) {
          log(`${green('已存在,免上传')} ${idx}/${files.length}: ${uploadName}`)
          this.config.removeMode && delete compilation.assets[file.name]
          resolve(result);
        } else {
          if (err.statusCode == 404) {
            console.log('对象不存在');
          } else if (err.statusCode == 403) {
            console.log('没有该对象读权限');
          }
          // 如果获取失败，则处理文件上传
          this.qcloudUploadFile(file, idx, files, compilation, uploadName)
          .then((uRes) => {
            resolve(uRes);
          }).catch((uErr) => {
            reject(uErr);
          })
        }
      });
    });
  }
  qiniuCheckOSSFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string) {
    return new Promise((resolve, reject) => {
      this.client.bucketManager.stat(this.currentProvider.bucket, uploadName, (err, respBody, respInfo) => {
        if (err) {
          reject(err)
        }
        const { statusCode } = respInfo
        if (statusCode == 200) {
          log(`${green('已存在,免上传')} ${idx}/${files.length}: ${uploadName}`)
          this.config.removeMode && delete compilation.assets[file.name]
          resolve(respBody)
        } else {
          this.qiniuUploadFile(file, idx, files, compilation, uploadName)
            .then((uRes) => {
              resolve(uRes);
            }).catch((uErr) => {
              reject(uErr);
            })
        }
      })
    })
  }

  batchUploadFiles(files, compilation: Compilation) {
    let i = 1;
    return Promise.all(map(files, (file) => {
      file.$retryTime = 0;
      let uploadName;
      if (path.sep === '/') {
        uploadName = path.join(this.finalPrefix, file.name);
      } else {
        // Windows 路径进行处理
        uploadName = path.join(this.finalPrefix, file.name).split(path.sep).join('/');
      }
      // 是否检测文件存在，不检测直接上传处理
      if (!this.config.existCheck) {
        return this.uploadFile(file, i++, files, compilation, uploadName);
      } else {
        return this.checkOSSFile(file, i++, files, compilation, uploadName)
      }
    }))
  }

  uploadFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string) {
    // 上传文件处理
    if (this.providerType === ProviderType.AliOSS) {
      return this.aliUploadFile(file, idx, files, compilation, uploadName);
    }

    if (this.providerType === ProviderType.QCloudOSS) {
      return this.qcloudUploadFile(file, idx, files, compilation, uploadName);
    }

    // 七牛云
    if (this.providerType === ProviderType.QiniuOSS) {
      return this.qiniuUploadFile(file, idx, files, compilation, uploadName);
    }

    return Promise.reject('没有找到上传SDK!');
  }

  aliUploadFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string) {
    return new Promise((resolve, reject) => {
      const fileCount = files.length;
      // 获取文件内容进行压缩处理
      getFileContentBuffer(file, this.config.gzip)
        .then((contentBuffer) => {
          const opt = this.getOSSUploadOptions();
          const _this = this;
          function _uploadAction() {
            file.$retryTime++;
            log(`开始上传 ${idx}/${fileCount}: ${file.$retryTime > 1 ? '第' + (file.$retryTime - 1) + '次重试' : ''}`, uploadName);
            _this.client.put(uploadName, contentBuffer, opt)
              .then(response => {
                log(`上传成功 ${idx}/${fileCount}: ${uploadName}`);
                _this.config.removeMode && delete compilation.assets[file.name];
                resolve(response);
              }).catch(err => {
                if (file.$retryTime < _this.config.retry + 1) {
                  _uploadAction();
                } else {
                  reject(err);
                }
              });
          }
          _uploadAction();
        }).catch((err) => {
          reject(err);
        })
    });
  }

  qcloudUploadFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string) {
    return new Promise((resolve, reject) => {
      const fileCount = files.length;
      getFileContentBuffer(file, this.config.gzip)
        .then((contentBuffer) => {
          const _this = this;
          function _uploadAction() {
            file.$retryTime++;
            log(`开始上传 ${idx}/${fileCount}: ${file.$retryTime > 1 ? '第' + (file.$retryTime - 1) + '次重试' : ''}`, uploadName);
            _this.client.putObject({
              Bucket: _this.currentProvider.Bucket, /* 填入您自己的存储桶，必须字段 */
              Region: _this.currentProvider.Region,  /* 存储桶所在地域，例如ap-beijing，必须字段 */
              Key: uploadName,  /* 存储在桶里的对象键（例如1.jpg，a/b/test.txt），必须字段 */
              Body: contentBuffer, /* 必须 */
            }, function (err, data) {
              if (err) {
                if (file.$retryTime < _this.config.retry + 1) {
                  _uploadAction();
                } else {
                  reject(err);
                }

              }else {
                log(`上传成功 ${idx}/${fileCount}: ${uploadName}`);
                _this.config.removeMode && delete compilation.assets[file.name];
                resolve(data);
              }
            });
          }
          _uploadAction();
        })
        .catch((err) => {
          reject(err);
        })
    });
  }

  qiniuUploadFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string) {
    return new Promise((resolve, reject) => {
      const fileCount = files.length;
      getFileContentBuffer(file, this.config.gzip).then(contentBuffer => {
        const _this = this
        function _uploadAction() {
          file.$retryTime++;
          log(`开始上传 ${idx}/${fileCount}: ${file.$retryTime > 1 ? '第' + (file.$retryTime - 1) + '次重试' : ''}`, uploadName);
          _this.client.formUploader.put(_this.client.qiniuToken, uploadName, contentBuffer, _this.client.putExtra, (respErr, respBody, respInfo) => {
            if (respErr) {
              log(`respErr: ${respErr}`)
              reject(respErr)
            }
            const { statusCode } = respInfo
            if (statusCode == 200) {
              log(`上传成功 ${idx}/${fileCount}: ${uploadName}`);
              _this.config.removeMode && delete compilation.assets[file.name];
              resolve(respBody);
            } else {
              if (file.$retryTime < _this.config.retry + 1) {
                _uploadAction();
              } else {
                reject(respBody);
              }
            }
          });
        }
        _uploadAction();
      }).catch(err => {
        reject(err)
      })
    })
  }

  getOSSUploadOptions() {
    const currentOptions = this.currentProvider.options;
    const gzip = this.config.gzip;
    if (gzip) {
      if (currentOptions) {
        currentOptions.headers['Content-Encoding'] = 'gzip';
        return currentOptions;
      } else {
        return {
          headers: { 'Content-Encoding': 'gzip' }
        }
      }
    } else {
      return currentOptions ? currentOptions : undefined;
    }
  }

  debug(...args) {
    this.config.enableLog && log(...args);
  }
}
function getTimeStr(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`
}

function getFileContentBuffer(file, gzipFlag) {
  if (!gzipFlag) return Promise.resolve(Buffer.from(file.content))
  return new Promise((resolve, reject) => {
    zlib.gzip(Buffer.from(file.content), {}, (err, gzipBuffer) => {
      if (err) reject(err)
      resolve(gzipBuffer)
    })
  })
}

function log(...args) {
  console.log(chalk.bgMagenta('[webpack-cdn-plugin]:'), ...args) // eslint-disable-line
}

function warn(...args) {
  console.warn(chalk.bgMagenta('[webpack-ossplus-plugin]:'), ...args) // eslint-disable-line
}
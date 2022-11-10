'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var path = require('path');
var chalk = require('chalk');
var lodashEs = require('lodash-es');
var AliOSS = require('ali-oss');
var COS = require('cos-nodejs-sdk-v5');
var buffer = require('buffer');
var zlib = require('zlib');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var chalk__default = /*#__PURE__*/_interopDefaultLegacy(chalk);
var AliOSS__default = /*#__PURE__*/_interopDefaultLegacy(AliOSS);
var COS__default = /*#__PURE__*/_interopDefaultLegacy(COS);
var zlib__default = /*#__PURE__*/_interopDefaultLegacy(zlib);

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

function __spreadArray(to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
}

var defaultConfig = {
    provider: {},
    retry: 3,
    existCheck: true,
    // prefix 或者 ossBaseDir + project 二选一
    ossBaseDir: 'auto_upload_ci',
    project: '',
    exclude: /.*\.html$/,
    include: /.*/,
    enableLog: false,
    ignoreError: false,
    removeMode: true,
    gzip: true,
};
var red = chalk__default["default"].red;
var green = chalk__default["default"].bold.green;
var yellow = chalk__default["default"].yellow;
var ProviderType;
(function (ProviderType) {
    ProviderType[ProviderType["AliOSS"] = 0] = "AliOSS";
    ProviderType[ProviderType["QCloudOSS"] = 1] = "QCloudOSS"; // 腾讯云OSS
})(ProviderType || (ProviderType = {}));
var WebpackOSSPlusPlugin = /** @class */ (function () {
    function WebpackOSSPlusPlugin(config) {
        this.config = defaultConfig; // 配置参数
        this.client = {}; // 阿里云OSS客户端
        this.finalPrefix = ""; // 最终计算出来的prefix路径
        this.currentProvider = {}; // 当前提供服务商信息
        // 合并配置信息
        this.config = lodashEs.mergeWith(lodashEs.cloneDeep(this.config), config || {}, function (objVal, srcVal) {
            if (lodashEs.isPlainObject(objVal) && lodashEs.isPlainObject(srcVal)) {
                return lodashEs.merge(objVal, srcVal);
            }
            else {
                return srcVal;
            }
        });
        var _a = this.config, retry = _a.retry, provider = _a.provider, ossBaseDir = _a.ossBaseDir, project = _a.project;
        // 容错处理
        if (typeof retry !== 'number' || retry < 0) {
            this.config.retry = 0;
        }
        // 上传OSS的最终路径
        this.finalPrefix = "".concat(ossBaseDir, "/").concat(project);
        this.debug('默认配置:', defaultConfig);
        this.debug('项目配置:', config);
        this.debug('最终使用的配置:', this.config);
        if (typeof provider.aliOSS !== 'undefined') {
            this.currentProvider = provider.aliOSS;
            this.providerType = ProviderType.AliOSS;
            var _b = provider.aliOSS, accessKeyId = _b.accessKeyId, accessKeySecret = _b.accessKeySecret, bucket = _b.bucket, region = _b.region;
            this.client = AliOSS__default["default"]({
                accessKeyId: accessKeyId,
                accessKeySecret: accessKeySecret,
                bucket: bucket,
                region: region
            });
        }
        else if (typeof provider.qcloudOS !== 'undefined') {
            this.currentProvider = provider.qcloudOS;
            this.providerType = ProviderType.QCloudOSS;
            var _c = provider.qcloudOS, SecretId = _c.SecretId, SecretKey = _c.SecretKey;
            this.client = new COS__default["default"]({
                SecretId: SecretId,
                SecretKey: SecretKey
            });
        }
    }
    WebpackOSSPlusPlugin.prototype.apply = function (compiler) {
        var _this_1 = this;
        if (compiler.hooks && compiler.hooks.emit) {
            // webpack 5
            compiler.hooks.emit.tapAsync('WebpackOSSPlusPlugin', function (compilation, cb) {
                _this_1.pluginEmitFn(compilation, cb);
            });
        }
        else {
            if (typeof compiler.plugin === 'undefined')
                return;
            compiler.plugin('emit', function (compilation, cb) {
                _this_1.pluginEmitFn(compilation, cb);
            });
        }
    };
    WebpackOSSPlusPlugin.prototype.pickupAssetsFile = function (compilation) {
        var _a, _b;
        var matched = {};
        var keys = Object.keys(compilation.assets);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            // 排除不符合要求的文件
            if ((_a = this.config.exclude) === null || _a === void 0 ? void 0 : _a.test(key)) {
                continue;
            }
            // 查找符合条件的文件
            if ((_b = this.config.include) === null || _b === void 0 ? void 0 : _b.test(key)) {
                matched[key] = compilation.assets[key];
            }
        }
        return lodashEs.map(matched, function (value, name) { return ({
            name: name,
            path: value.existsAt ? value.existsAt : name,
            content: value.source()
        }); });
    };
    WebpackOSSPlusPlugin.prototype.pluginEmitFn = function (compilation, cb) {
        var _this_1 = this;
        var files = this.pickupAssetsFile(compilation);
        if (!files) {
            warn("".concat(yellow('\n 没有找到符合条件的文件上传，请检测配置信息！')));
            return;
        }
        log("".concat(green('\nOSS 上传开始......')));
        this.batchUploadFiles(files, compilation)
            .then(function () {
            log("".concat(green('OSS 上传完成\n')));
            cb();
        })
            .catch(function (err) {
            log("".concat(red('OSS 上传出错'), "::: ").concat(red(err.code), "-").concat(red(err.name), ": ").concat(red(err.message)));
            _this_1.config.ignoreError || compilation.errors.push(err);
            cb();
        });
    };
    WebpackOSSPlusPlugin.prototype.checkOSSFile = function (file, idx, files, compilation, uploadName) {
        // 检测OSS是否存在该文件处理
        if (this.providerType === ProviderType.AliOSS) {
            return this.aliUploadFile(file, idx, files, compilation, uploadName);
        }
        if (this.providerType === ProviderType.QCloudOSS) {
            return this.qcloudUploadFile(file, idx, files, compilation, uploadName);
        }
        return Promise.reject('检测OSS文件失败！');
    };
    WebpackOSSPlusPlugin.prototype.aliCheckOSSFile = function (file, idx, files, compilation, uploadName) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            _this_1.client.list({
                prefix: uploadName,
                'max-keys': 50
            }).then(function (res) {
                var arr = (res.objects || []).filter(function (item) { return item.name === uploadName; });
                if (arr && arr.length > 0) {
                    var timeStr = getTimeStr(new Date(res.objects[0].lastModified));
                    log("".concat(green('已存在,免上传'), " (\u4E0A\u4F20\u4E8E ").concat(timeStr, ") ").concat(idx, "/").concat(files.length, ": ").concat(uploadName));
                    _this_1.config.removeMode && delete compilation.assets[file.name];
                    resolve(res);
                }
                else {
                    throw new Error('not exist & need upload');
                }
            }).catch(function (err) {
                // 如果获取失败，则处理文件上传
                _this_1.uploadFile(file, idx, files, compilation, uploadName)
                    .then(function (uRes) {
                    resolve(uRes);
                }).catch(function (uErr) {
                    reject(uErr);
                });
            });
        });
    };
    WebpackOSSPlusPlugin.prototype.qcloudCheckOSSFile = function (file, idx, files, compilation, uploadName) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            _this_1.client.headObject({
                Bucket: _this_1.currentProvider.Bucket,
                Region: _this_1.currentProvider.Region,
                key: uploadName
            }, function (err, result) {
                if (result) {
                    log("".concat(green('已存在,免上传'), " ").concat(idx, "/").concat(files.length, ": ").concat(uploadName));
                    _this_1.config.removeMode && delete compilation.assets[file.name];
                    resolve(result);
                }
                else {
                    if (err.statusCode == 404) {
                        console.log('对象不存在');
                    }
                    else if (err.statusCode == 403) {
                        console.log('没有该对象读权限');
                    }
                    // 如果获取失败，则处理文件上传
                    _this_1.qcloudUploadFile(file, idx, files, compilation, uploadName)
                        .then(function (uRes) {
                        resolve(uRes);
                    }).catch(function (uErr) {
                        reject(uErr);
                    });
                }
            });
        });
    };
    WebpackOSSPlusPlugin.prototype.batchUploadFiles = function (files, compilation) {
        var _this_1 = this;
        var i = 1;
        return Promise.all(lodashEs.map(files, function (file) {
            file.$retryTime = 0;
            var uploadName = path__default["default"].join(_this_1.finalPrefix, file.name);
            // 是否检测文件存在，不检测直接上传处理
            if (!_this_1.config.existCheck) {
                return _this_1.uploadFile(file, i++, files, compilation, uploadName);
            }
            else {
                return _this_1.checkOSSFile(file, i++, files, compilation, uploadName);
            }
        }));
    };
    WebpackOSSPlusPlugin.prototype.uploadFile = function (file, idx, files, compilation, uploadName) {
        // 上传文件处理
        if (this.providerType === ProviderType.AliOSS) {
            return this.aliUploadFile(file, idx, files, compilation, uploadName);
        }
        if (this.providerType === ProviderType.QCloudOSS) {
            return this.qcloudUploadFile(file, idx, files, compilation, uploadName);
        }
        return Promise.reject('没有找到上传SDK!');
    };
    WebpackOSSPlusPlugin.prototype.aliUploadFile = function (file, idx, files, compilation, uploadName) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            var fileCount = files.length;
            // 获取文件内容进行压缩处理
            getFileContentBuffer(file, _this_1.config.gzip)
                .then(function (contentBuffer) {
                var opt = _this_1.getOSSUploadOptions();
                var _this = _this_1;
                function _uploadAction() {
                    file.$retryTime++;
                    log("\u5F00\u59CB\u4E0A\u4F20 ".concat(idx, "/").concat(fileCount, ": ").concat(file.$retryTime > 1 ? '第' + (file.$retryTime - 1) + '次重试' : ''), uploadName);
                    _this.client.put(uploadName, contentBuffer, opt)
                        .then(function (response) {
                        log("\u4E0A\u4F20\u6210\u529F ".concat(idx, "/").concat(fileCount, ": ").concat(uploadName));
                        _this.config.removeMode && delete compilation.assets[file.name];
                        resolve(response);
                    }).catch(function (err) {
                        if (file.$retryTime < _this.config.retry + 1) {
                            _uploadAction();
                        }
                        else {
                            reject(err);
                        }
                    });
                }
                _uploadAction();
            }).catch(function (err) {
                reject(err);
            });
        });
    };
    WebpackOSSPlusPlugin.prototype.qcloudUploadFile = function (file, idx, files, compilation, uploadName) {
        var _this_1 = this;
        return new Promise(function (resolve, reject) {
            var fileCount = files.length;
            getFileContentBuffer(file, _this_1.config.gzip)
                .then(function (contentBuffer) {
                var _this = _this_1;
                function _uploadAction() {
                    file.$retryTime++;
                    log("\u5F00\u59CB\u4E0A\u4F20 ".concat(idx, "/").concat(fileCount, ": ").concat(file.$retryTime > 1 ? '第' + (file.$retryTime - 1) + '次重试' : ''), uploadName);
                    _this.client.putObject({
                        Bucket: _this.currentProvider.Bucket,
                        Region: _this.currentProvider.Region,
                        Key: uploadName,
                        Body: contentBuffer, /* 必须 */
                    }, function (err, data) {
                        if (err) {
                            if (file.$retryTime < _this.config.retry + 1) {
                                _uploadAction();
                            }
                            else {
                                reject(err);
                            }
                        }
                        else {
                            log("\u4E0A\u4F20\u6210\u529F ".concat(idx, "/").concat(fileCount, ": ").concat(uploadName));
                            _this.config.removeMode && delete compilation.assets[file.name];
                            resolve(data);
                        }
                    });
                }
                _uploadAction();
            })
                .catch(function (err) {
                reject(err);
            });
        });
    };
    WebpackOSSPlusPlugin.prototype.getOSSUploadOptions = function () {
        var currentOptions = this.currentProvider.options;
        var gzip = this.config.gzip;
        if (gzip) {
            if (currentOptions) {
                currentOptions.headers['Content-Encoding'] = 'gzip';
                return currentOptions;
            }
            else {
                return {
                    headers: { 'Content-Encoding': 'gzip' }
                };
            }
        }
        else {
            return currentOptions ? currentOptions : undefined;
        }
    };
    WebpackOSSPlusPlugin.prototype.debug = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        this.config.enableLog && log.apply(void 0, args);
    };
    return WebpackOSSPlusPlugin;
}());
function getTimeStr(d) {
    return "".concat(d.getFullYear(), "-").concat(d.getMonth() + 1, "-").concat(d.getDate(), " ").concat(d.getHours(), ":").concat(d.getMinutes());
}
function getFileContentBuffer(file, gzipFlag) {
    if (!gzipFlag)
        return Promise.resolve(buffer.Buffer.from(file.content));
    return new Promise(function (resolve, reject) {
        zlib__default["default"].gzip(buffer.Buffer.from(file.content), {}, function (err, gzipBuffer) {
            if (err)
                reject(err);
            resolve(gzipBuffer);
        });
    });
}
function log() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.log.apply(console, __spreadArray([chalk__default["default"].bgMagenta('[webpack-cdn-plugin]:')], args, false)); // eslint-disable-line
}
function warn() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.warn.apply(console, __spreadArray([chalk__default["default"].bgMagenta('[webpack-alioss-plugin]:')], args, false)); // eslint-disable-line
}

exports.WebpackOSSPlusPlugin = WebpackOSSPlusPlugin;

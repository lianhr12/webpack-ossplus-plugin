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
        headers?: any;
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
        headers?: any;
    };
}
export interface WebpackOSSPlusPluginOptions {
    provider: {
        /**
         * 阿里 oss 认证相关信息, 全部支持环境变量
         */
        aliOSS?: AliOSSOptions;
        qcloudOS?: QcouldOSSOptions;
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
    include?: RegExp;
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
interface IFileInfo {
    name: string;
    path: string;
    content: string;
    $retryTime: number;
}
export declare class WebpackOSSPlusPlugin {
    config: WebpackOSSPlusPluginOptions;
    client: any;
    finalPrefix: string;
    currentProvider: AliOSSOptions & QcouldOSSOptions;
    providerType: any;
    constructor(config: WebpackOSSPlusPluginOptions);
    apply(compiler: CompilerExt): void;
    pickupAssetsFile(compilation: Compilation): IFileInfo[] | undefined;
    pluginEmitFn(compilation: Compilation, cb: any): void;
    checkOSSFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string): Promise<unknown>;
    aliCheckOSSFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string): Promise<unknown>;
    qcloudCheckOSSFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string): Promise<unknown>;
    batchUploadFiles(files: any, compilation: Compilation): Promise<any>;
    uploadFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string): Promise<unknown>;
    aliUploadFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string): Promise<unknown>;
    qcloudUploadFile(file: IFileInfo, idx: number, files: IFileInfo[], compilation: Compilation, uploadName: string): Promise<unknown>;
    getOSSUploadOptions(): {
        headers?: any;
    } & {
        headers?: any;
    };
    debug(...args: any[]): void;
}
export {};

type KV<T> = {
  [key: string]: T;
};

type RouteInfo = {
  path: string;
  name?:string;
  action: Function;
  beforeEnter ? : Function;
  afterEnter ? : Function;
  beforeLeave ? : Function;
  beforeUpdate?:Function;
  afterUpdate?:Function;
};

type RouterOption = {
  routes: RouteInfo[];
  beforeEach? : Function;
  afterEach? : Function;
};

type RouterState = {
  state:{
    name:string;
  }
}

type PushStateEvent = CustomEvent&RouterState;

const DEFAULT_OPTION: RouterOption = {
  routes: []
};

function isEmpty(val:any):boolean {
  if (Object.prototype.toString.call(val) !== '[object Array]') {
    return true;
  }
  return val.length === 0;
}

function isFunction(val:any):boolean{
  return typeof val === 'function';
}

function formatPath(path:string):string{
  if(!/^\//.test(path)){
    path = `/${path}`;
  }
  return path;
}

function createPushstateEvent(state:KV<string>):PushStateEvent{
  const ev = new CustomEvent('pushstate');
  ev['state'] = state;
  return <PushStateEvent>ev;
}
/**
 * @class Route
 */
export class Route {
  static paramPattern = /\/\:\b(\w+)\b/g;
  private readonly _requiredParams:string[]=[];
  private readonly _validator:RegExp;
  private readonly _path:string;
  private readonly _action:Function|null=null;
  public readonly name:string;
  public readonly afterEnter:Function|null=null;
  public readonly beforeEnter:Function|null=null;
  public readonly afterUpdate:Function|null=null;
  public readonly beforeUpdate:Function|null=null;
  public readonly beforeLeave:Function|null=null;
  public readonly params:KV<string|undefined>={};
  public fullpath:string='';
  constructor(info:RouteInfo){
    const {
      path,
      name,
      action,
      beforeEnter,
      afterEnter,
      beforeUpdate,
      afterUpdate,
      beforeLeave
    } = info;
    this.name = name;
    // 修正路径
    this._path = formatPath(path);
    isFunction(action)&&(this._action=action.bind(this));
    isFunction(beforeEnter)&&(this.beforeEnter=beforeEnter.bind(this));
    isFunction(afterEnter)&&(this.afterEnter=afterEnter.bind(this));
    isFunction(beforeUpdate)&&(this.beforeUpdate=beforeUpdate.bind(this));
    isFunction(afterUpdate)&&(this.afterUpdate=afterUpdate.bind(this));
    isFunction(beforeLeave)&&(this.beforeLeave=beforeLeave.bind(this));

    let tmpPath =  this._path;
    let match = Route.paramPattern.exec(this._path);
    while(match){
      const param = match[1];
      this._requiredParams.push(param);
      this.params[param] = undefined;
      tmpPath = tmpPath.replace(`/:${param}`,'/(\\w+)');
      match = Route.paramPattern.exec(this._path);
    }
    Route.paramPattern.lastIndex = 0;
    this._validator = new RegExp(`^${tmpPath.replace(/\//g,'\\/')}$`);
  }
  /**
   * 匹配目标路径是否为当前路由
   */
  public match(fullpath:string):boolean{
    return this._validator.test(fullpath);
  }
  /**
   * 解析参数并执行action
   */
  public parse(fullpath:string){
    this.fullpath = fullpath;
    if(!isEmpty(this._requiredParams)){
      const match = this._validator.exec(fullpath);
      for(let i=0,len=this._requiredParams.length;i<len;i++){
        this.params[this._requiredParams[i]] = match[i+1];
      }
    }
    this._action();
  }
}
/**
 * @class Router
 */
export default class Router {
  private readonly _pathPattern:RegExp;
  private readonly _routes: KV<Route>={};
  private readonly _history:History;
  private _state:KV<string>={};
  private readonly _beforeEach:Function|null=null;
  private readonly _afterEach:Function|null=null;
  private _current:Route|null=null;
  constructor(options: RouterOption) {
    if (!options || !options.routes || isEmpty(options.routes)) {
      this._onError('参数错误');
    }
    const opt = {
      ...DEFAULT_OPTION,
      ...options
    };
    this._history = window.history;
    isFunction(opt.beforeEach)&&(this._beforeEach=opt.beforeEach.bind(this));
    isFunction(opt.afterEach)&&(this._afterEach=opt.afterEach.bind(this));
    this._addRoutes(opt.routes);
    this._start();
  }
  private _addRoutes(infolist: RouteInfo[]) {
    for(const info of infolist){
      const name = info.name || '';
      if(this._routes[name]){
        this._onError('name不能重复');
      }
      if(!name){
        info.name = `${name}_${Math.random().toString(16)}`;
      }
      this._routes[info.name] = new Route(info);
    }
  }
  private _start(){
    window.addEventListener('popstate', (ev:PopStateEvent)=>{
      this._onRouteChange(window.location.pathname,ev.state.name);
    },false);
    window.addEventListener('pushstate', (ev:PushStateEvent)=>{
      this._onRouteChange(window.location.pathname,ev.state.name);
    },false);
    this._restore();
  }
  /**
   * 恢复路由状态，用于刷新页面
   */
  private _restore() {
    this._onRouteChange(window.location.pathname);
  }
  private _onRouteChange(path:string,name?:string) {
    const route = name?this._routes[name]:this._matchRoute(path);
    if(route){
      route.parse(path);

      const isSameRoute = this._current&&this._current.name===route.name||false;
      // 同一个route触发afterUpdate，否则触发目标route的afterEnter
      isSameRoute?route.afterUpdate&&route.afterUpdate():route.afterEnter&&route.afterEnter(this._current);

      this._current = route;
      // 非同一个route间的跳转后触发全局_beforeEach
      !isSameRoute&&this._afterEach&&this._afterEach(route);
    }else{
      this._onError('无匹配路由，请检查路径');
    }
  }
  private _pushState(state:KV<string>,path:string){
    this._history.pushState(state,'',path);
    window.dispatchEvent(createPushstateEvent(state));
  }
  private _matchRoute(path:string):Route|null{
    for(const name in this._routes){
      const route = this._routes[name];
      if(route.match(path)){
        return route;
      }
    }
    return null;
  }
  private _onError(msg?:string){
    throw new Error(msg);
  }
  public go(path: string) {
    const target = this._matchRoute(path);
    if(!target){
      this._onError('无匹配路由，请检查路径');
      return;
    }
    const isSameRoute = this._current&&this._current.name===target.name||false;
    let allow = true;
    if(this._current){
      const {beforeUpdate,beforeLeave} = this._current;
      if(isSameRoute){
        const currentParams = {...this._current.params};
        target.parse(path);
        const targetParams = {...target.params};
        let needUpdate = false;
        for(const key in currentParams){
          // 参数值改变触发更新
          if(currentParams[key]!==targetParams[key]){
            needUpdate = true;
            break;
          }
        }
        needUpdate?beforeUpdate&&(allow=beforeUpdate()):(allow=false);
      }else{
        // 首先出发当前route beforeLeave
        beforeLeave&&(allow=beforeLeave(target));
      }
    }
    // 返回false则中断跳转
    if(!allow){
      return;
    }
    // 非同一个route间的跳转前依次触发全局_beforeEach和target beforeEnter
    if(!isSameRoute){
      this._beforeEach&&this._beforeEach(target,this._current);
      target.beforeEnter&&(allow=target.beforeEnter(target,this._current));
    }
    // target beforeEnter也可以中断跳转
    if(!allow){
      return;
    }
    this._pushState({
      name: target.name
    },path);
  }
  public back(){
    this._history.back();
  }
}
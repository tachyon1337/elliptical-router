/*
 * =============================================================
 * elliptical.Router
 * =============================================================
 * Dependencies:
 * elliptical-utils,elliptical-mvc,elliptical-event,elliptical-url
 *
 * elliptical.Router implements a client-side version of "node express routing"
  * supports: (i) both html5 & hashTag routing
  *           (ii) virtual directories
  *           (iii) middleware
  *
  * Router consists of 5 classes: Listener,History,Location,Route & Router
  *
  * For a matched route, Router emits a data object with two properties:
  *  (i) route(path)
  *  (ii) the callback handlers, including a return function that matches the signature fn(req,res,next), binding params,body,query,route and
  *       statusCode to a request object
  *
  *       SAMPLE EXAMPLE IMPLEMENTATION
  *       var Router=require('elliptical-router');
  *       var Event=require('elliptical-event');
  *       var App=function(Router,Event){
  *           this.Router=Router;
  *           this.get=function(route,callbacks){
  *              this.Router.get(route,callbacks)
  *           }
  *           this.post=function(route,callbacks){
  *              this.Router.post(route,callbacks);
  *           }
  *           this.listen=function(){
  *              Event.on('onRouteDispatch',function(data){
  *                 _callStack(data.route,data.handlers);
  *              });
  *           }
  *
  *           function _callStack(route,handlers){
  *               //handle middleware callstack
  *           }
  *       }
  *
  *       var app=new App(Router,Event);
  *       app.get('/my/route/:id',function(req,res,next){
  *            var id=req.id;
  *            //do stuff
  *       });
  *
 *
 */

//umd pattern

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        //commonjs
        module.exports = factory(require('elliptical-utils'),require('elliptical-mvc'),require('elliptical-event'),require('elliptical-url'));
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['elliptical-utils','elliptical-mvc','elliptical-event','elliptical-url'], factory);
    } else {
        root.elliptical.Router=factory(root.elliptical.utils,root.elliptical,root.elliptical.Event,root.elliptical.url);
        root.returnExports = root.elliptical.Router;
    }
}(this, function (utils,elliptical,Event,url) {
    var Class=elliptical.Class,
        _=utils._;

    var Listener=Class.extend({
        events:{
            request:'elliptical.onDocumentRequest',
            click:'touchclick',
            orientation:'onOrientationChange'
        },
        backButtonSelector:'[data-role="back"]',

        on:function(){
            var self=this;

            $(window).on(this.events.request, function (event,data) {
                self.forward(data);
            });

            $(document).on(this.events.click, this.backButtonSelector, function (event) {
                Router.history();
            });

            $(window).on(this.events.orientation, function (event, data) {
                data.method='get';
                self.forward(event,data);
            });
        },

        off:function(){
            var self=this;

            $(window).off(this.events.request, function (event,data) {
                self.forward(data);
            });

            $(document).off(this.events.click, this.backButtonSelector, function (event) {
                Router.history();
            });

            $(window).off(this.events.orientation, function (event, data) {
                data.method='get';
                self.forward(event,data);
            });


        },

        reset:function(){
            this.off();
            this.on();
        },

        forward: function(data){
            var route=data.route;
            var params={};
            var method=data.method;
            Router.location(route,method,params);
        }

    },{});



    var History=Class.extend({
        stateObject:null,

        poppedDelay:700,

        pushHistory:false,

        push:function(){
            if(this.pushHistory){
                var stateObject=this.stateObject;
                var title = '';
                stateObject.route = Location.hashify(stateObject.route);
                window.history.pushState(stateObject, title, stateObject.route);
            }
        },

        pop:function(event){
            var self=this;
            var isTouch= $.support.touch || false;
            if (event.originalEvent.state) {
                var route = event.originalEvent.state.route;
                var params = event.originalEvent.state.params;
                var method = event.originalEvent.state.method;

                this.pushHistory = false;
                if (isTouch) {
                    setTimeout(function () {
                        Route.location(route,method,params);

                    }, self.poppedDelay);
                } else {
                    Route.location(route,method,params);
                }
            }
        },

        start:function(){
            var self=this;
            var route=Location.path();
            var params=Location.search;
            var method = 'get';
            var stateObj = { route: route, params: params, method: method };
            this.stateObject = stateObj;
            this.pushHistory = true;
            Route.location(stateObj.route,'get',params);
            $(window).on('popstate', function (event) {
                self.pop(event);
            });
        },

        end: function(){
            var self=this;
            this.stateObject = null;
            this.pushHistory = false;
            $(window).off('popstate', function (event) {
                self.pop(event);
            });
        }

    },{});

    var Route=Class.extend({
        dispatchEvent:'elliptical.onRouteDispatch',

        add: function (method, route, callbacks) {
            if (this.verify(route, method)) {
                var rte = { route: route, method: method, handle: callbacks };
                Router.routes.push(rte);
                if (Router.debug) {
                    var msg='route: ' + route + ' has been added. Method: ' + method;
                    (Router.enabled) ? console.log(msg) : Router.messageQueue.push(msg);
                }
            }
        },

        remove:function(route,method){
            var index = -1;
            Router.routes.forEach(function(obj,i){
                var route_=obj.route;
                var method_=obj.method;
                if(route===route_ && method===method_){
                    index=i;
                }
            });
            if (index > -1) {
                Router.routes.splice(index, 1);
                if (Router.debug) {
                    console.log('route: ' + route + ' has been removed');
                }
            }
        },

        verify: function (route, method) {
            var bool=true;
            Router.routes.every(function(obj){
                var route_=obj.route;
                var method_=obj.method;
                if(route===route_ && method===method_){
                    bool= false;
                }
            });

            return bool;
        },

        decodeUrl:function(url){
            return decodeURIComponent(url.replace(/\+/g, '%20'));
        },

        deserialize:function(s){
            var data = s.split("&");
            var p = [];
            for (var i = 0; i < data.length; i++) {
                var pair = this.decodeUrl(data[i]).split("=");
                var _name = pair[0];
                var value = pair[1];
                var entry = { name: _name, value: value };
                p.push(entry);

            }
            return p;
        },

        location:function(route, method,params){

            route=Location.deHashify(route);
            History.push();

            if (!this.dispatch(route,method,params)) {
                //error --------->no matched route
                //emit the error

                var handlers = [];
                handlers.push(this.error);
                var data_={
                    route:route,
                    handlers:handlers
                };

                Event.emit(this.dispatchEvent,data_);
            }
        },

        dispatch:function(route, method, params){
            var self=this;
            var dispatchEvent=this.dispatchEvent;
            var success = false;
            var routes=Router.routes;
            /* routes should be case insensitive */
            route=route.toLowerCase();
            routes.forEach(function(obj,index){
                var body={};
                var query={};
                var route_ = obj.route;
                /* routes should be case insensitive */
                route_=route_.toLowerCase();
                var routePath=Location.toPath(route);
                var rule = url.match(route_);
                var data = rule.parse(routePath);

                if ((data != null) && (obj.method.toLowerCase() === method.toLowerCase()) &&(!success)) {
                    if(method.toLowerCase()!='get'){
                        body=url.body(data);
                    }
                    /* query component */
                    query=url.query(route);

                    //populate the array of route handlers
                    var handlers = [];
                    var fn = self.next(data,body,query,routePath);
                    handlers.push(fn);

                    var callbacks = obj.handle;
                    for (var i = 0; i < callbacks.length; i++) {
                        handlers.push(callbacks[i]);
                    }

                    //emit the dispatch event
                    var data_={
                        route:routePath,
                        handlers:handlers
                    };

                    Event.emit(dispatchEvent,data_);
                    success = true;
                }

            });

            return success;

            /**
             * parses a location hashtag
             * if hashTag is set and location has hashtag but registered route does not, trim hashtag from location
             * @param route {String}  the registered route
             * @param location {String} the triggered route
             * @returns {*}
             */
            function parseHashTag(route,location){
                if(window.elliptical.$hashTag){
                    if((location).charAt(1) ==='#'){
                       if((route).charAt(1) !== '#'){
                           location=location.substring(2);
                       }
                    }
                }
                return location;
            }
        },

        next: function(params, body,query, route){
            return function (req, res, next) {
                res.statusCode = 200;
                req.params = params;
                req.query=query;
                req.route = route;
                req.body = body;
                next();
            }
        },

        error: function(req, res, next){
            res.statusCode = 404;
            var err = 'Page does not exist';
            next();
        }

    },{});

    /* replaces the native window.location object */
    var Location=Class.extend({
        "@class":'Location',

        /**
         * if hashTag bit is set, adds a hashtag to the route, if not already present
         * @param route {String}
         * @returns {String}
         */
        hashify:function(route){
            var virtualRoot=Router.virtualRoot;
            var isVirtual=(virtualRoot !== '/');
            if(Router.hashTag && isVirtual){
                if(route.indexOf(virtualRoot) !==0){
                    route=virtualRoot + route;
                }
                var index=virtualRoot.length;
                if((route).charAt(index + 1) !== '#'){
                    route=utils.stringInsertAt(route,index,'/#');
                }
            }else if(Router.hashTag){
                if((route).charAt(1) !== '#'){
                    route='/#' + route;
                }
            }else if(isVirtual){
                if(route.indexOf(virtualRoot) !==0){
                    route=virtualRoot + route;
                }
            }


            return route;
        },

        /**
         * if hashTag bit is set, removes the leading hashtag from the route
         * @param route {String}
         * @returns {String}
         */
        deHashify:function(route){
            var virtualRoot=Router.virtualRoot;
            if(virtualRoot !=='/'){
                if(route.indexOf(virtualRoot)===0){
                    route=route.replace(virtualRoot,'');
                }
            }
            if(Router.hashTag){
                if((route).charAt(1) === '#'){
                    route=route.substring(2);
                }
            }
            return route;
        },

        hashRoot:function(route){
            if(Router.hashTag && route.slice(-1)==='#'){
                route+='/';
                return route;
            }else{
                return route;
            }
        },

        /**
         * replaces location.path, favtoring out virtual root and hashtag
         * @returns {string}
         */
        path:function(){
            var hashTag=window.elliptical.$hashTag;
            var virtualRoot=window.elliptical.$virtualRoot;
            var path;
            if(hashTag){
                path=location.hash;
                if((path).charAt(0) ==='#'){
                    path=path.substring(1);
                }
                if(path===''){
                    path='/';
                }
                path=this.toPath(path);
            }else{
                path=location.pathname;
                if(virtualRoot!=='/' ){
                    if(path.indexOf(virtualRoot)===0){
                        path=path.replace(virtualRoot,'');
                    }
                }
            }

            return path;

        },

        toPath:function(route){
            var rte=route.split('?');
            return rte[0];
        },

        /**
         * triggers a registered route
         * @param route {String}
         */
        redirect:function(route){
            //note: application.js will overwrite this if History enabled
            location.href=route;
        },

        /**
         * reloads the current route
         */
        reload:function(){
            //note: application.js will overwrite this if History enabled
            location.reload();
        },

        url:url,
        href:location.href,
        host:location.host,
        hostname:location.hostname,
        origin:location.origin,
        protocol:location.protocol,
        port:location.port,
        search:location.search



    },{});

    var Router = Class.extend({
        "@class":'Router',
        validMethods:['get','post','put','delete'],
        enabled:false,
        debug:true,
        callbacks:[],
        routes:[],
        virtualRoot:'/',
        hashTag:false,
        messageQueue:[],


        get:function(route,callbacks){
            this.parseMethod('get',route,callbacks);
        },

        post:function(route,callbacks){
            this.parseMethod('post',route,callbacks);
        },

        put:function(route,callbacks){
            this.parseMethod('put',route,callbacks);
        },

        delete:function(route,callbacks){
            this.parseMethod('delete',route,callbacks);
        },

        parseMethod:function(method,route,callbacks){
            if(!_.contains(this.validMethods,method)){
                return false;
            }
            var handlers = [];
            if ('string' != typeof route) {
                route = '/';
            }
            var args = Array.prototype.slice.call(arguments, 0);
            for (var i = 0; i < args.length; i++) {
                if (typeof args[i] === 'function') {
                    handlers.push(args[i]);
                }
            }
            if (args.length < 1) {
                console.log('error adding route: "' + route + '".  A route must have at least one handler function.')
            } else {
                Route.add(method, route, handlers);
            }

        },

        remove:function(route, method){
            if (!this.enabled) {
                return false;
            }
            Route.remove(route, method);
        },

        removeAll:function(){
            var self=this;
            if (!this.enabled) {
                return false;
            }
            this.routes.forEach(function(obj){
                self.remove(obj.route,obj.method);
            });
        },

        location: function(route, method,params, delay){
            if (!this.enabled) {
                return false;
            }
            if(typeof params==='undefined'){
                params={};
            }
            route=url.sanitize(route);
            route=Location.hashRoot(route);

            var stateObj = { route: route, params: params, method: method };
            History.stateObject = stateObj;
            History.pushHistory = true;

            if (typeof delay != 'undefined') {
                setTimeout(function () {
                    Route.location(route,method,params);
                }, delay);
            } else {
                Route.location(route, method, params);
            }
        },




        start:function(){
            if (this.enabled) {    /* if already started, exit */
                return false;
            }
            this.enabled = true;
            History.start();
            Listener.on();
            if (this.debug) {
                var msg = 'Router has started in debug mode';
                console.log(msg);
                this.messageQueue.forEach(function(m){
                    console.log(m);
                });
                this.messageQueue.length=0;
            }
        },


        pause: function(){
            this.enabled=false;
            Listener.off();
        },

        resume:function(){
            this.enabled=false;
            Listener.on();
        },

        history:function(pages, delay){
            if (typeof delay != 'undefined') {
                setTimeout(function () {
                    if (typeof pages === 'undefined') {
                        window.history.back();
                    } else {
                        window.history.go(pages);
                    }

                }, delay);
            } else {
                if (typeof pages === 'undefined') {
                    window.history.back();
                } else {
                    window.history.go(pages);
                }
            }
        },

        end: function(){
            this.enabled=false;
            this.routes=[];
            History.end();
            Listener.off();
        },

        /**
         * set Route event provider and event name
         * @param $event {Object}
         * @param eventName {String}
         */
        $provider:function($event,eventName){
            if(typeof $event==='string'){
                Route.dispatchEvent=eventName;
            }else if(typeof $event !== 'undefined'){
                Event=$event;
                if(typeof eventName==='string'){
                    Route.dispatchEvent=eventName;
                }
            }
        },

        /* configure Listener/Event settings */
        configure:function(opts){
            if(opts.request){
                Listener.events.request=opts.request;
            }
            if(opts.orientation){
                Listener.events.orientation=opts.orientation;
            }
            if(opts.click){
                Listener.events.click=opts.click;
            }
            if(opts.backButtonSelector){
                Listener.backButtonSelector=opts.backButtonSelector;
            }
            if(opts.dispatchEvent){
                Route.dispatchEvent=opts.dispatchEvent;
            }
            /* reset Listener */
            Listener.reset();
        }


    },{});


    Router.Location=Location;


    return Router;
}));

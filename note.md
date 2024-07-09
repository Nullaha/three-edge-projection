
它的思路是： 

flatten the triangle  

xyz三维的triangle变成xz平面上的riangle。  

 



1. const clone = mesh.geomery.clone() ?  

clone只是一个geometry  

2. clone.applyMatrix4(mesh.matrixWorld)?  

作用是将mesh的世界矩阵应用到clone上。

目的是将clone的顶点从局部坐标转为世界坐标咯。

改变的是clone.attribute.position.

3. 计算重心  
```js
import {Vector3,Triangle  } from 'three';

const _center = /* @__PURE__ */ new Vector3();

const a = new Vector3(1.108752965927124,0,-0.07575390487909317)

const b = new Vector3(1.1001445055007935,0,-0.02606511302292347)

const c = new Vector3(1.1345930099487305,0,-0.14679700136184692)

_center
  .copy( a ) // _center复制了顶点a
  .add( b )  // _center加b
  .add( c )
  .multiplyScalar( 1 / 3 );

console.log(_center); // Vector3 { x: 1.1144968271255493, y: 0, z: -0.08287200642128785}

```

4. vec3.subVectors(a,_center) ??  

>.subVectors ( a : Vector3, b : Vector3 ) : this
Sets this vector to a - b.  

👆得到的是 b->a向量。   


5. a.addScaledVector( _vec, extendMultiplier );??  


6. 大数据量的循环，返回进度值。  

```js
function* generate(count,options = {} ) {
  console.log('generate方法开始-----------')
  const {onProgress} = options

  // let time = window.performance.now()
  let time = Date.now()

  for (let i = 0; i < count; i++) {

    // ...
    // const delta = window.performance.now() - time;
    const delta = Date.now() - time;
    if (delta > 2){

      if(onProgress){
        const progress = i/count
        onProgress(`${progress}:${i}/${count}`)
      }

      yield;
      // time = window.performance.now();
      time = Date.now()
    }
  }

  console.log('generate方法结束-----------')
  return 'xixi'
}

/**
 * 使用
 */
const task = generate(10000000,{
  onProgress: (progress) => {
    console.log('进度',progress)
  }
})
let res = task.next()
while(!res.done){
  res = task.next()
}

const result = res.value


// generate方法开始-----------
// 进度 0.0012927:12927/10000000
// 进度 0.0025799:25799/10000000
// 进度 0.0056418:56418/10000000
// 进度 0.0089603:89603/10000000
// 进度 0.0113967:113967/10000000
// 进度 0.0145132:145132/10000000
// 进度 0.0181371:181371/10000000
// 进度 0.0216073:216073/10000000
// 进度 0.0254954:254954/10000000
// 进度 0.0291127:291127/10000000
// ... 
```


7. Vector2 孔洞 ？  

vector2s 数组中的路径根据其方向（顺时针或逆时针）分成轮廓形状和孔洞形状。

8. new ShapeGeometry(shapes) ?? 
```js
import { ShapeGeometry, Shape, Vector2 } from 'three';

// 逆时针的是孔洞
const hole = new Shape()
const shape = new Shape()
shape.holes = [hole]
const shapes = [shape]

const geom = new ShapeGeometry(shapes)
```


